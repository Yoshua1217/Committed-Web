import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
let sequence = 0;
const modules = { "./ink-model": { uid: () => `test-${++sequence}` } };
for (const name of ["canvas-model", "canvas-create", "page-diagram", "canvas-actions"]) {
  const source = fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", code)(mod, mod.exports, id => modules[id]);
  modules[`./${name}`] = mod.exports;
}
const { PageDiagramGesture } = modules["./page-diagram"];
const { DEFAULT_STYLE, connection } = modules["./canvas-model"];
const { makeCanvasObject } = modules["./canvas-create"];
const context = { save() {}, restore() {}, setTransform() {}, isPointInStroke() { return false; } };
const node = (x,y) => makeCanvasObject("rounded", {x,y}, DEFAULT_STYLE);
test("page shapes support click creation, reverse dragging, and non-destructive resize", () => {
  const gesture = new PageDiagramGesture();
  gesture.begin("shape", {x:200,y:200}, [], [], 1, "diamond", DEFAULT_STYLE, context);
  assert.equal(gesture.objects[0].w, 220);
  gesture.move({x:100,y:120},1);
  assert.equal(gesture.objects[0].x,100);
  assert.equal(gesture.objects[0].w,100);
  const shape=gesture.objects[0];
  gesture.begin("select",{x:100,y:120},[shape],[shape.id],1,"rounded",DEFAULT_STYLE,context);
  gesture.move({x:80,y:100},1);
  assert.equal(gesture.objects[0].w,120);
  assert.equal(shape.w,100);
});
test("page connectors bind, follow moved nodes, and detach when an endpoint is dragged free", () => {
  const a=node(100,100), b=node(500,300), gesture=new PageDiagramGesture();
  gesture.begin("connector",{x:320,y:170},[a,b],[],1,"rounded",DEFAULT_STYLE,context);
  gesture.move({x:500,y:370},1);
  const edge=gesture.objects[2];
  assert.equal(edge.board.from.id,a.id); assert.equal(edge.board.to.id,b.id);
  gesture.begin("select",{x:210,y:150},[a,b],[],1,"rounded",DEFAULT_STYLE,context);
  gesture.move({x:260,y:200},1,false,true);
  assert.equal(connection(edge,[...gesture.objects,edge]).start.x,370);
  const selectedObjects=[a,b,edge];
  gesture.begin("select",{x:500,y:370},selectedObjects,[edge.id],1,"rounded",DEFAULT_STYLE,context);
  gesture.move({x:900,y:800},1);
  assert.equal(gesture.objects[2].board.to,undefined);
  assert.deepEqual(gesture.objects[2].board.end,{x:900,y:800});
});
test("locked page shapes cannot move and deleting a node preserves its connector location", () => {
  const a=node(100,100); a.board.locked=true;
  const gesture=new PageDiagramGesture();
  gesture.begin("select",{x:200,y:160},[a],[],1,"rounded",DEFAULT_STYLE,context);
  gesture.move({x:500,y:500},1);
  assert.equal(gesture.objects[0].x,100);
  a.board.locked=false;
  const edge={...node(0,0),kind:"connector",board:{from:{id:a.id,side:"right"},end:{x:700,y:500}}};
  let next;
  modules["./canvas-actions"].arrangeCanvas("delete",[a,edge],[a.id],v=>next=v,()=>{});
  assert.equal(next.length,1); assert.deepEqual(next[0].board.start,{x:320,y:170});
});
