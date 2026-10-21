"use client";
export default function InkEraserOptions({ partial, setPartial, eraserSize, setEraserSize }: { partial: boolean; setPartial: (value: boolean) => void; eraserSize: number; setEraserSize: (value: number) => void }) {
  return <div className="ink-context"><button aria-pressed={!partial} onClick={() => setPartial(false)}>Whole stroke</button><button aria-pressed={partial} onClick={() => setPartial(true)}>Partial eraser</button><label>Size <input type="range" min="4" max="80" value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))} /></label></div>;
}
