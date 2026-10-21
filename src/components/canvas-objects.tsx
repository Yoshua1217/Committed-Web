"use client";
import { memo, useMemo, useId } from "react";
import type { InkObject } from "@/lib/ink-model";
import { connection, shapePath } from "@/lib/canvas-model";
import { cleanCanvasHtml, textHtml } from "@/lib/canvas-text";

export const CanvasShape = memo(function CanvasShape({ object, editing }: { object: InkObject; editing: boolean }) {
  const b = object.board ?? {}, w = object.w ?? 200, h = object.h ?? 120, kind = b.shape ?? "rounded";
  const html = useMemo(() => cleanCanvasHtml(b.html ?? textHtml(object.text ?? "")), [b.html, object.text]);
  const textColor = (kind === "text" || kind === "frame") && (!b.textColor || b.textColor === "#203353") ? "var(--primary)" : b.textColor ?? object.color;
  const padding = ["diamond", "triangle", "star", "hexagon", "cloud", "ellipse"].includes(kind) ? "23%" : "18px";
  return <div className={`canvas-object canvas-kind-${kind}`} data-object-id={object.id} style={{ left: object.x ?? 0, top: object.y ?? 0, width: w, height: h, opacity: object.opacity }}>
    {(kind !== "text" || (b.borderWidth ?? 0) > 0 || (b.fill && b.fill !== "transparent")) && <svg className="canvas-object-geometry" width={w} height={h} style={{ filter: b.shadow ? "drop-shadow(0 5px 8px #25365712)" : undefined }}><path d={shapePath(kind, w, h, b.radius)} fill={kind === "frame" ? "transparent" : b.fill ?? "#dbeafe"} fillOpacity={b.fillOpacity ?? 1} stroke={b.border ?? "#93b4e4"} strokeWidth={b.borderWidth ?? 1.5} strokeDasharray={b.dash === "dashed" ? "8 5" : b.dash === "dotted" ? "2 5" : undefined} strokeLinejoin="round" />{kind === "sticky" && <path d={`M ${w - 24} ${h} L ${w - 24} ${h - 24} L ${w} ${h - 24} Z`} fill="#0000000c" />}</svg>}
    {!editing && <div className="canvas-object-text" style={{ padding: kind === "text" || kind === "frame" ? "6px" : padding, color: textColor, fontSize: b.fontSize ?? 20, textAlign: b.align ?? "center", justifyContent: kind === "note" || kind === "sticky" || kind === "text" ? "flex-start" : "center", WebkitTextStroke: b.textOutline ? `0.8px ${textColor}` : undefined, WebkitTextFillColor: b.textOutline ? "transparent" : undefined }} dangerouslySetInnerHTML={{ __html: html }} />}
  </div>;
});

export function CanvasConnections({ objects, selected }: { objects: InkObject[]; selected: string[] }) {
  const markerId = `canvas-arrow-${useId().replace(/:/g, "")}`;
  const map = new Map(objects.map(o => [o.id, o]));
  return <svg className="canvas-connections" width="1" height="1"><defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></marker></defs>{objects.filter(o => o.kind === "connector").map(o => {
    const c = connection(o, map), s = o.board ?? {};
    return <g key={o.id} data-object-id={o.id}>
      {selected.includes(o.id) && <path d={c.path} fill="none" stroke="color-mix(in srgb, var(--primary) 20%, transparent)" strokeWidth={(s.borderWidth ?? 2) + 8} />}
      <path d={c.path} fill="none" stroke={s.border ?? "#64748b"} strokeWidth={s.borderWidth ?? 2} strokeDasharray={s.dash === "dashed" ? "8 6" : s.dash === "dotted" ? "2 5" : undefined} strokeLinecap="round" strokeLinejoin="round" markerEnd={s.arrowEnd !== false ? `url(#${markerId})` : undefined} markerStart={s.arrowStart ? `url(#${markerId})` : undefined} />
      <path data-connector-hit={o.id} d={c.path} fill="none" stroke="transparent" strokeWidth="18" style={{ pointerEvents: "stroke" }} />
      {o.text && <text x={c.label.x} y={c.label.y - 10} fill={s.textColor ?? "var(--primary)"} fontSize={s.fontSize ?? 16} textAnchor="middle" stroke="var(--background)" strokeWidth="6" paintOrder="stroke" strokeLinejoin="round">{o.text}</text>}
    </g>;
  })}</svg>;
}
