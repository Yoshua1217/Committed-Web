import { type InkObject } from "./ink-model";
import { bounds, connection, moveObjects, resizeBox, snapAnchor, type CanvasStyle, type ShapeKind, type XY } from "./canvas-model";
import { makeCanvasObject } from "./canvas-create";

/** Page-local diagram gestures; ink and document navigation remain in InkCanvas. */
export class PageDiagramGesture {
  before: InkObject[] = [];
  objects: InkObject[] = [];
  selected: string[] = [];
  start: XY = { x: 0, y: 0 };
  mode = "";
  handle = "";
  object?: InkObject;
  begin(tool: string, point: XY, objects: InkObject[], selected: string[], scale: number, shape: ShapeKind, style: CanvasStyle, context: CanvasRenderingContext2D, extend = false) {
    this.before = objects; this.objects = objects; this.start = point; this.selected = selected; this.mode = ""; this.handle = ""; this.object = undefined;
    if (tool === "shape") { this.object = makeCanvasObject(shape, point, style); this.mode = "create"; this.selected = [this.object.id]; this.objects = [...objects, this.object]; return; }
    if (tool === "connector") {
      const snap = snapAnchor(objects, point, scale);
      this.object = { ...makeCanvasObject("text", point, style), kind: "connector", board: { ...style, start: snap?.point ?? point, end: point, ...(snap ? { from: snap.anchor } : {}), route: "curve", arrowEnd: true } };
      this.mode = "connect"; this.selected = [this.object.id]; return;
    }
    const chosen = objects.find(o => selected.length === 1 && o.id === selected[0]);
    if (chosen && !chosen.board?.locked && chosen.kind === "connector") {
      const line = connection(chosen, objects);
      for (const end of ["start", "end"] as const) if (Math.hypot(point.x - line[end].x, point.y - line[end].y) < 12 / scale) { this.object = chosen; this.handle = end; this.mode = "endpoint"; return; }
    }
    if (chosen && !chosen.board?.locked && chosen.kind === "shape") {
      const b = bounds(chosen);
      for (const [handle, x, y] of [["nw",0,0],["n",.5,0],["ne",1,0],["e",1,.5],["se",1,1],["s",.5,1],["sw",0,1],["w",0,.5]] as const) {
        if (Math.hypot(point.x-b.x-b.w*x, point.y-b.y-b.h*y)<10/scale) { this.mode="resize"; this.handle=handle; this.object=chosen; return; }
      }
    }
    const hit = [...objects].sort((a,b)=>b.order-a.order).find(o => {
      if (o.kind === "connector") { context.save(); context.setTransform(1,0,0,1,0,0); context.lineWidth=16/scale; const hit=context.isPointInStroke(new Path2D(connection(o,objects).path),point.x,point.y); context.restore(); return hit; }
      const b=bounds(o); return point.x>=b.x && point.x<=b.x+b.w && point.y>=b.y && point.y<=b.y+b.h;
    });
    if (!hit) { this.selected=[]; this.mode="marquee"; return; }
    this.selected = extend ? [...new Set([...selected, hit.id])] : selected.includes(hit.id) ? selected : objects.filter(o=>o.id===hit.id || (hit.group && o.group===hit.group)).map(o=>o.id);
    this.mode = hit.board?.locked ? "locked" : "move";
  }
  move(point: XY, scale: number, shift = false, unsnapped = false) {
    let dx=point.x-this.start.x, dy=point.y-this.start.y;
    if (this.mode === "create" && this.object) {
      if (Math.hypot(dx,dy)>3/scale) { if (shift) { const side=Math.max(Math.abs(dx),Math.abs(dy)); dx=Math.sign(dx)*side; dy=Math.sign(dy)*side; } this.objects=[...this.before,{...this.object,x:Math.min(this.start.x,this.start.x+dx),y:Math.min(this.start.y,this.start.y+dy),w:Math.max(24,Math.abs(dx)),h:Math.max(24,Math.abs(dy))}]; }
    } else if ((this.mode === "connect" || this.mode === "endpoint") && this.object) {
      const snap=unsnapped ? null : snapAnchor(this.before,point,scale), end=this.handle || "end", key=end==="start"?"from":"to";
      const board={...this.object.board,[end]:snap?.point??point,[key]:snap?.anchor};
      const next={...this.object,board}; this.objects=this.mode==="connect"?[...this.before,next]:this.before.map(o=>o.id===next.id?next:o);
    } else if (this.mode === "resize" && this.object) {
      const box=resizeBox(bounds(this.object),this.handle,{x:dx,y:dy},shift); this.objects=this.before.map(o=>o.id===this.object!.id?{...o,...box}:o);
    } else if (this.mode === "move") {
      if (shift) { if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0; }
      if (!unsnapped) { const first=this.before.find(o=>this.selected.includes(o.id)); if(first) { const b=bounds(first); let bestX=7/scale,bestY=7/scale,sx=0,sy=0; for(const other of this.before.filter(o=>!this.selected.includes(o.id)&&o.kind==="shape")) { const t=bounds(other); for(const a of [0,.5,1]) for(const c of [0,.5,1]) { const x=t.x+t.w*c-(b.x+b.w*a+dx), y=t.y+t.h*c-(b.y+b.h*a+dy); if(Math.abs(x)<bestX){bestX=Math.abs(x);sx=x;} if(Math.abs(y)<bestY){bestY=Math.abs(y);sy=y;} } } dx+=sx;dy+=sy; } }
      this.objects=moveObjects(this.before,new Set(this.selected),dx,dy);
    } else if (this.mode === "marquee") {
      const x=Math.min(point.x,this.start.x),y=Math.min(point.y,this.start.y),r=Math.max(point.x,this.start.x),bottom=Math.max(point.y,this.start.y);
      this.selected=this.before.filter(o=>{const b=bounds(o);return b.x>=x&&b.y>=y&&b.x+b.w<=r&&b.y+b.h<=bottom;}).map(o=>o.id);
    }
    return this.objects;
  }
}
