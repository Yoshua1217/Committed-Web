"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TbCheck, TbLink, TbHighlight, TbList, TbListNumbers } from "react-icons/tb";
import type { InkObject } from "@/lib/ink-model";
import { type Camera, bounds, connection } from "@/lib/canvas-model";
import { canvasPlainText, cleanCanvasHtml, textHtml } from "@/lib/canvas-text";
export default function CanvasTextEditor({ object, camera, objects, onSave, onClose }: { object: InkObject; camera: Camera; objects: InkObject[]; onSave: (html: string, text: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null), saveRef = useRef(onSave);
  useLayoutEffect(() => { saveRef.current = onSave; }, [onSave]);
  const [link, setLink] = useState(false), [url, setUrl] = useState("https://"), selection = useRef<Range | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), dirty = useRef(false);
  const initial = useRef(object.board?.html ?? textHtml(object.text ?? ""));
  const flush = useCallback(() => { if (timer.current) clearTimeout(timer.current); if (dirty.current && ref.current) { const html = cleanCanvasHtml(ref.current.innerHTML); dirty.current = false; saveRef.current(html, canvasPlainText(html)); } }, []);
  useLayoutEffect(() => { if (ref.current) { ref.current.innerHTML = cleanCanvasHtml(initial.current); ref.current.focus(); const range = document.createRange(); range.selectNodeContents(ref.current); range.collapse(false); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(range); } return flush; }, [flush]);
  useEffect(() => { window.addEventListener("pagehide", flush); return () => window.removeEventListener("pagehide", flush); }, [flush]);
  const changed = () => { dirty.current = true; if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(flush, 400); };
  const command = (name: string, value?: string) => { ref.current?.focus(); document.execCommand(name, false, value); changed(); };
  const s = object.board ?? {}, b = object.kind === "connector" ? { ...connection(object, objects).label, w: 240, h: 80 } : bounds(object);
  return <div className="canvas-edit-overlay" style={{ left: b.x * camera.scale + camera.x, top: b.y * camera.scale + camera.y, width: Math.max(180, b.w * camera.scale) }}>
    <div className="canvas-rich-toolbar" role="toolbar" aria-label="Text formatting" onPointerDown={e => e.stopPropagation()}>
      <button aria-label="Bold" onMouseDown={e => e.preventDefault()} onClick={() => command("bold")}><b>B</b></button><button aria-label="Italic" onMouseDown={e => e.preventDefault()} onClick={() => command("italic")}><i>I</i></button>
      <select aria-label="Text heading" defaultValue="div" onChange={e => command("formatBlock", e.target.value)}><option value="div">Text</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select>
      <button aria-label="Bullet list" onMouseDown={e => e.preventDefault()} onClick={() => command("insertUnorderedList")}><TbList /></button><button aria-label="Numbered list" onMouseDown={e => e.preventDefault()} onClick={() => command("insertOrderedList")}><TbListNumbers /></button><button aria-label="Add checkbox" onMouseDown={e => e.preventDefault()} onClick={() => command("insertHTML", '<span data-canvas-check="false" contenteditable="false" role="checkbox" aria-checked="false">☐</span>&nbsp;')}><TbCheck /></button><button aria-label="Highlight text" onMouseDown={e => e.preventDefault()} onClick={() => command("hiliteColor", "#fef08a")}><TbHighlight /></button><button aria-label="Add link" onMouseDown={e => e.preventDefault()} onClick={() => { const s = window.getSelection(); selection.current = s?.rangeCount ? s.getRangeAt(0).cloneRange() : null; setLink(true); }}><TbLink /></button><button aria-label="Finish editing" onClick={() => { flush(); onClose(); }}><TbCheck /></button>
    </div>
    {link && <form className="canvas-link-form" onSubmit={e => { e.preventDefault(); if (!/^(https?:\/\/|mailto:)/i.test(url)) return; ref.current?.focus(); if (selection.current) { const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(selection.current); } command("createLink", url); setLink(false); }}><input aria-label="Link URL" autoFocus value={url} onChange={e => setUrl(e.target.value)} /><button>Add</button><button type="button" onClick={() => setLink(false)}>Cancel</button></form>}
    <div ref={ref} className="canvas-text-editor" role="textbox" aria-label="Canvas text" aria-multiline="true" contentEditable suppressContentEditableWarning style={{ minHeight: Math.max(60, b.h * camera.scale), fontSize: (s.fontSize ?? 20) * camera.scale, color: s.textColor ?? "#203353", textAlign: s.align ?? "left", background: s.fill && s.fill !== "transparent" ? s.fill : "#ffffff" }} onInput={changed} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); flush(); onClose(); } }} onPaste={e => { e.preventDefault(); const html = e.clipboardData.getData("text/html"); document.execCommand("insertHTML", false, html ? cleanCanvasHtml(html) : textHtml(e.clipboardData.getData("text/plain"))); changed(); }} onDrop={e => e.preventDefault()} />
  </div>;
}
