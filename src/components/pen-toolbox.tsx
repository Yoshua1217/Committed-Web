"use client";
import { useRef, useState } from "react";
import { TbArrowDown, TbArrowUp, TbDotsVertical, TbPlus } from "react-icons/tb";
import { InkPreferences, Pen, STARTER_PENS, fountainWidths, uid } from "@/lib/ink-model";
import PenPreview from "./pen-preview";
import { PenSettings } from "./ink-settings";

export default function PenToolbox({ preferences, onPreferences, onClose }: { preferences: InkPreferences; onPreferences: (value: InkPreferences) => void; onClose: () => void }) {
  const [editing, setEditing] = useState<Pen | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ action: "delete" | "duplicate"; pen: Pen } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragged = useRef<string | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const pens = preferences.pens;
  const save = (pen: Pen) => onPreferences({ ...preferences, pens: pens.map(p => p.id === pen.id ? pen : p) });
  const reorder = (id: string, target: string) => {
    const from = pens.findIndex(p => p.id === id), to = pens.findIndex(p => p.id === target);
    if (from < 0 || to < 0 || from === to) return;
    const ordered = [...pens]; const [moved] = ordered.splice(from, 1); ordered.splice(to, 0, moved);
    onPreferences({ ...preferences, pens: ordered });
  };
  const finishDrag = () => { if (dragged.current && dropTarget) reorder(dragged.current, dropTarget); dragged.current = null; setDropTarget(null); };
  const confirm = () => {
    if (!confirmation) return;
    const index = pens.findIndex(p => p.id === confirmation.pen.id);
    if (index < 0) { setConfirmation(null); return; }
    if (confirmation.action === "delete") {
      if (pens.length < 2) return;
      const remaining = pens.filter(p => p.id !== confirmation.pen.id);
      onPreferences({ ...preferences, pens: remaining, defaultPen: preferences.defaultPen === confirmation.pen.id ? remaining[0].id : preferences.defaultPen });
    } else {
      const ordered = [...pens]; ordered.splice(index + 1, 0, { ...confirmation.pen, id: uid(), name: `${confirmation.pen.name} copy` });
      onPreferences({ ...preferences, pens: ordered });
    }
    setConfirmation(null); setMenu(null);
  };
  const ask = (action: "delete" | "duplicate", pen: Pen) => { setMenu(null); setConfirmation({ action, pen }); };

  if (editing && !confirmation) return <PenSettings key={editing.id} pen={editing} onSave={save} onClose={() => setEditing(null)} onBack={() => setEditing(null)} canDelete={pens.length > 1}
    onDefault={pen => onPreferences({ ...preferences, defaultPen: pen.id, pens: pens.map(p => p.id === pen.id ? pen : p) })}
    onDelete={() => ask("delete", editing)} onDuplicate={pen => ask("duplicate", { ...pen, id: editing.id, name: editing.name })} />;

  return <div className="ink-modal-scrim" onClick={confirmation ? () => setConfirmation(null) : onClose} onKeyDown={e => {
    if (e.key === "Escape") { e.stopPropagation(); if (confirmation) setConfirmation(null); else if (menu) setMenu(null); else onClose(); }
    if (e.key === "Tab") {
      const dialog = e.currentTarget.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
      const items = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]');
      if (items?.length) { const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    }
  }}>
    {confirmation ? <section className="ink-dialog" role="alertdialog" aria-modal="true" aria-label={`${confirmation.action === "delete" ? "Delete" : "Duplicate"} pen`} onClick={e => e.stopPropagation()}>
      <h2>{confirmation.action === "delete" ? "Delete pen?" : "Duplicate pen?"}</h2>
      <p><strong>{confirmation.pen.name}</strong></p>
      <p>{confirmation.action === "delete" ? "Remove this pen from your toolbox and toolbar. Existing handwriting stays unchanged." : "Add a copy with the same colour, thickness, and settings."}</p>
      <div className="ink-actions"><button autoFocus onClick={() => setConfirmation(null)}>Cancel</button><button className={confirmation.action === "delete" ? "ink-danger" : ""} disabled={confirmation.action === "delete" && pens.length < 2} onClick={confirm}>{confirmation.action === "delete" ? "Delete pen" : "Duplicate pen"}</button></div>
    </section> : <section className="ink-dialog ink-toolbox" role="dialog" aria-modal="true" aria-label="Your toolbox" onClick={e => { e.stopPropagation(); setMenu(null); }}>
      <div className="ink-dialog-title"><h2>Your toolbox</h2><button autoFocus aria-label="Close toolbox" onClick={onClose}>×</button></div>
      <p className="ink-toolbox-hint">Drag to reorder. Top to bottom matches left to right in your toolbar.</p>
      <div className="ink-toolbox-list">
        <button className="ink-toolbox-new" onClick={() => { const pen = { ...STARTER_PENS[0], id: uid(), name: "New pen" }; onPreferences({ ...preferences, pens: [pen, ...pens] }); setEditing(pen); }}><TbPlus aria-hidden="true" /><span>New pen</span></button>
        {pens.map((pen, index) => <div key={pen.id} data-toolbox-pen={pen.id} className={`ink-toolbox-card${dropTarget === pen.id ? " is-drop-target" : ""}`} draggable
          onDragStart={e => { dragged.current = pen.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", pen.id); }}
          onDragOver={e => { e.preventDefault(); if (dragged.current) setDropTarget(pen.id); }}
          onDrop={e => { e.preventDefault(); if (dragged.current) reorder(dragged.current, pen.id); dragged.current = null; setDropTarget(null); }}
          onDragEnd={() => { dragged.current = null; setDropTarget(null); }}>
          <button className="ink-toolbox-preview" aria-label={`Edit or drag ${pen.name} to reorder`} title="Click to edit · drag to reorder" onClick={() => setEditing(pen)}
            onPointerDown={e => { if (e.pointerType === "mouse") return; e.preventDefault(); touchStart.current = { x: e.clientX, y: e.clientY }; dragged.current = pen.id; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={e => { if (e.pointerType === "mouse" || dragged.current !== pen.id || !touchStart.current || Math.hypot(e.clientX - touchStart.current.x, e.clientY - touchStart.current.y) < 6) return; const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-toolbox-pen]"); if (target) { setDropTarget(target.dataset.toolboxPen ?? null); target.scrollIntoView({ block: "nearest" }); } }}
            onPointerUp={e => { if (e.pointerType !== "mouse") { if (!dropTarget) setEditing(pen); finishDrag(); touchStart.current = null; } }} onPointerCancel={() => { dragged.current = null; setDropTarget(null); }}
            onKeyDown={e => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); const target = pens[index + (e.key === "ArrowUp" ? -1 : 1)]; if (target) reorder(pen.id, target.id); } }}><span aria-hidden="true"><PenPreview pen={pen} /></span></button>
          <button className="ink-toolbox-edit" onClick={() => { setMenu(null); setEditing(pen); }} aria-label={`Edit ${pen.name}`}>

            <span className="ink-toolbox-details"><strong>{pen.name}</strong><span className="ink-toolbox-style">{pen.style}{pen.id === preferences.defaultPen ? " · Default" : ""}</span>
              <span className="ink-toolbox-meta"><span>{pen.style === "fountain" ? `${fountainWidths(pen).min.toFixed(1)}–${fountainWidths(pen).max.toFixed(1)}` : pen.width} px</span><span><i style={{ background: pen.color }} />{pen.color}</span><span>{Math.round(pen.opacity * 100)}% opacity</span></span>
            </span>
          </button>
          <div className="ink-toolbox-menu-wrap"><button className="ink-toolbox-more" aria-label={`Options for ${pen.name}`} aria-expanded={menu === pen.id} onClick={e => { e.stopPropagation(); setMenu(menu === pen.id ? null : pen.id); }}><TbDotsVertical aria-hidden="true" /></button>
            {menu === pen.id && <div className="ink-toolbox-menu" onClick={e => e.stopPropagation()}>
              <button onClick={() => ask("duplicate", pen)}>Duplicate</button><button className="ink-danger" disabled={pens.length < 2} title={pens.length < 2 ? "Keep at least one pen" : "Delete pen"} onClick={() => ask("delete", pen)}>Delete</button>
              <button disabled={index === 0} onClick={() => { reorder(pen.id, pens[index - 1].id); setMenu(null); }}><TbArrowUp aria-hidden="true" /> Move up</button><button disabled={index === pens.length - 1} onClick={() => { reorder(pen.id, pens[index + 1].id); setMenu(null); }}><TbArrowDown aria-hidden="true" /> Move down</button>
            </div>}
          </div>
        </div>)}
      </div>
    </section>}
  </div>;
}
