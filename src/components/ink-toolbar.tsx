"use client";
import { useEffect, useRef } from "react";
import type { InkPreferences, Pen } from "@/lib/ink-model";
import { uid } from "@/lib/ink-model";
import { TbArrowLeft, TbArrowRight, TbEraser, TbGeometry, TbHandMove, TbLasso, TbPhoto, TbEyeOff, TbPointer, TbArrowUpRight, TbNote } from "react-icons/tb";
import PenPreview from "./pen-preview";
import type { InkTool } from "./ink-canvas";
import "./note-workspace.css";
type Props = { prefs: InkPreferences; pen: Pen; tool: InkTool; setTool: (tool: InkTool) => void; setPenId: (id: string) => void; onPreferences: (prefs: InkPreferences) => void; setEditingPen: (pen: Pen) => void; pensCollapsed: boolean; setPensCollapsed: (update: (value: boolean) => boolean) => void; busy?: boolean; onImage?: () => void; onSticky: () => void };
export default function InkToolbar({prefs, pen, tool, setTool, setPenId, onPreferences, setEditingPen, pensCollapsed, setPensCollapsed, busy, onImage, onSticky}: Props) {
 const toolbarRef = useRef<HTMLDivElement>(null), penTimer = useRef<ReturnType<typeof setTimeout> | null>(null), draggedPen = useRef("");
 useEffect(() => { if (pensCollapsed && toolbarRef.current) toolbarRef.current.scrollLeft = 0; }, [pensCollapsed]);
 useEffect(() => () => { if (penTimer.current) clearTimeout(penTimer.current); }, []);
 return (
    <div ref={toolbarRef} className={`ink-toolbar${prefs.leftHanded ? " is-left-handed" : ""}${pensCollapsed ? " has-collapsed-pens" : ""}`} role="toolbar" aria-label="Writing and drawing tools">


      {(pensCollapsed ? [pen] : prefs.pens).map(p => <button draggable onDragStart={() => { draggedPen.current = p.id; }} onDragOver={e => e.preventDefault()} onDrop={() => { const pens = [...prefs.pens]; const index = pens.findIndex(v => v.id === draggedPen.current); if (index < 0) return; const [moved] = pens.splice(index, 1); pens.splice(pens.findIndex(v => v.id === p.id), 0, moved); onPreferences({ ...prefs, pens }); }} key={p.id} className={`ink-preset${p.style === "fountain" ? " ink-preset-fountain" : ""}${tool === "pen" && p.id === pen.id ? " is-active" : ""}`} aria-label={`${p.name}, ${p.style}, ${p.width} pixels, ${p.color}, ${Math.round(p.opacity * 100)}% opacity`} aria-pressed={tool === "pen" && p.id === pen.id} title={`${p.name} · ${p.style} · ${p.width} px · ${p.color} · ${Math.round(p.opacity * 100)}% opacity · hold to edit`} aria-expanded={tool === "pen" && p.id === pen.id ? !pensCollapsed : undefined} onClick={() => { if (tool === "pen" && p.id === pen.id) setPensCollapsed(value => !value); setPenId(p.id); setTool("pen"); }} onDoubleClick={() => setEditingPen(p)} onPointerDown={() => { penTimer.current = setTimeout(() => setEditingPen(p), 500); }} onPointerUp={() => { if (penTimer.current) clearTimeout(penTimer.current); }} onPointerLeave={() => { if (penTimer.current) clearTimeout(penTimer.current); }} onContextMenu={e => { e.preventDefault(); setEditingPen(p); }}><PenPreview pen={p} />{p.id === prefs.defaultPen && <small>•</small>}</button>)}
      <button onClick={() => { const p = { ...pen, id: uid(), name: "New pen" }; onPreferences({ ...prefs, pens: [...prefs.pens, p] }); setEditingPen(p); }} title="Add saved pen">+</button>
      <button aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} title="Eraser" aria-label="Eraser"><TbEraser className="ink-tool-icon" aria-hidden="true" /></button>
      {!prefs.compact && <>
        {<button aria-pressed={tool === "lasso"} onClick={() => setTool("lasso")} title="Lasso" aria-label="Lasso"><TbLasso className="ink-tool-icon" aria-hidden="true" /></button>}
        <button aria-pressed={tool === "shape"} onClick={() => setTool("shape")} title="Shapes" aria-label="Shapes"><TbGeometry className="ink-tool-icon" aria-hidden="true" /></button>
        {onImage && <button disabled={busy} onClick={onImage} title="Insert image" aria-label="Insert image"><TbPhoto className="ink-tool-icon" aria-hidden="true" /></button>}
        <button aria-pressed={tool === "text"} onClick={() => setTool("text")} title="Text" aria-label="Text"><svg className="ink-tool-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4H20L20.5 9H19L18 6H13.5V18L16 18.5V20H8V18.5L10.5 18V6H6L5 9H3.5L4 4Z" fill="currentColor" /><path d="M5 23H19" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".35" /></svg></button>
        {<button aria-pressed={tool === "cover"} onClick={() => setTool("cover")} title="Cover: draw over answers, then use Study covers to hide and reveal them" aria-label="Cover answers for study"><TbEyeOff className="ink-tool-icon" aria-hidden="true" /></button>}
        <button aria-pressed={tool === "pan"} onClick={() => setTool("pan")} title="Pan" aria-label="Pan"><TbHandMove className="ink-tool-icon" aria-hidden="true" /></button>
      </>}
      {!prefs.compact && <><button aria-label="Select objects" title="Select objects (V)" aria-pressed={tool === "select"} onClick={() => setTool("select")}><TbPointer className="ink-tool-icon" /></button><button aria-label="Connect shapes" title="Connect shapes (C)" aria-pressed={tool === "connector"} onClick={() => setTool("connector")}><TbArrowUpRight className="ink-tool-icon" /></button><button aria-label="Sticky note" title="Sticky note" onClick={onSticky}><TbNote className="ink-tool-icon" /></button></>}
      <button className="ink-toolbar-toggle" aria-expanded={!prefs.compact} aria-label={prefs.compact ? "Expand toolbar" : "Collapse toolbar"} title={prefs.compact ? "Expand toolbar" : "Collapse toolbar"} onClick={() => onPreferences({ ...prefs, compact: !prefs.compact })}>{prefs.compact ? <TbArrowRight className="ink-tool-icon" aria-hidden="true" /> : <TbArrowLeft className="ink-tool-icon" aria-hidden="true" />}</button>
    </div>
 );
}
