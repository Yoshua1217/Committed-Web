"use client";
import { useState } from "react";
import { Course, DEFAULT_PAPER, Paper, Pen, STARTER_PENS, fountainWidths, uid } from "@/lib/ink-model";

const PAPER_COLOURS = [
  { name: "White", color: "#ffffff", lines: "#d8deea" },
  { name: "Ivory", color: "#fffdf7", lines: "#d8deea" },
  { name: "Cream", color: "#f2ead8", lines: "#cec5b3" },
  { name: "Sand", color: "#e4d2b5", lines: "#bca98d" },
  { name: "Tan", color: "#cfb58f", lines: "#a68c6c" },
  { name: "Warm grey", color: "#d4d0c8", lines: "#b0aca4" },
  { name: "Dim grey", color: "#a8aaa9", lines: "#868a88" },
  { name: "Charcoal", color: "#20242c", lines: "#4b5563" },
];
const LINE_COLOURS = [
  { name: "Light grey", color: "#d8deea" },
  { name: "Slate", color: "#868a88" },
  { name: "Blue grey", color: "#8b9eb5" },
  { name: "Navy blue", color: "#263f65" },
  { name: "Warm grey", color: "#b0aca4" },
  { name: "Sepia", color: "#a68c6c" },
  { name: "Charcoal", color: "#4b5563" },
  { name: "White", color: "#ffffff" },
];

export function PaperSettings({ paper, onChange, courses = [], onCourse, defaultPaper = DEFAULT_PAPER }: { paper: Paper; onChange: (paper: Paper) => void; courses?: Course[]; onCourse?: (course: Course) => void; defaultPaper?: Paper }) {
  return <div className="ink-paper-settings">
    <div className="ink-paper-controls">
    {courses.length > 0 && <label>Course defaults<select value="" onChange={e => { const course = courses.find(c => c.id === e.target.value); if (course) { onChange({ ...course.paper }); onCourse?.(course); } }}><option value="">Choose a course…</option>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    <label>Paper type<select value={paper.kind} onChange={e => onChange({ ...paper, kind: e.target.value as Paper["kind"] })}>{["blank", "ruled", "grid", "dots", "graph", "cornell"].map(kind => <option key={kind}>{kind}</option>)}</select></label>
    <label>Page size<select value={paper.width === 816 && paper.height === 1056 ? "letter" : paper.width === 794 && paper.height === 1123 ? "a4" : "custom"} onChange={e => { if (e.target.value !== "custom") onChange({ ...paper, width: e.target.value === "letter" ? 816 : 794, height: e.target.value === "letter" ? 1056 : 1123 }); }}><option value="letter">Letter</option><option value="a4">A4</option><option value="custom">Custom / landscape</option></select></label>
    <label>Background<input type="color" value={paper.color} onChange={e => onChange({ ...paper, color: e.target.value })} /></label>
    <label>Lines<input type="color" value={paper.lineColor} onChange={e => onChange({ ...paper, lineColor: e.target.value })} /></label>
    <label>Spacing<input type="range" min="10" max="60" value={paper.spacing} onChange={e => onChange({ ...paper, spacing: Number(e.target.value) })} /></label>
    <label>Width<input type="number" min="200" max="2000" value={paper.width} onChange={e => onChange({ ...paper, width: Math.max(200, Math.min(2000, Number(e.target.value) || 816)) })} /></label>
    <label>Height<input type="number" min="200" max="2400" value={paper.height} onChange={e => onChange({ ...paper, height: Math.max(200, Math.min(2400, Number(e.target.value) || 1056)) })} /></label>
    <label className="ink-check"><input type="checkbox" checked={paper.margin} onChange={e => onChange({ ...paper, margin: e.target.checked })} /> Margin</label>
    <button type="button" onClick={() => onChange({ ...paper, width: paper.height, height: paper.width })}>Rotate paper</button>
    <button type="button" title="Restore your global default paper settings" onClick={() => onChange({ ...defaultPaper })}>Reset to default</button>
    </div>
    <fieldset className="ink-paper-colours"><legend>Background presets</legend><div>{PAPER_COLOURS.map(preset => <button type="button" key={preset.color} aria-pressed={paper.color.toLowerCase() === preset.color} onClick={() => onChange({ ...paper, color: preset.color, lineColor: preset.lines })}><span style={{ background: preset.color }} />{preset.name}</button>)}</div></fieldset>
    <fieldset className="ink-paper-colours"><legend>Line colour presets</legend><div>{LINE_COLOURS.map(preset => <button type="button" key={preset.color} aria-pressed={paper.lineColor.toLowerCase() === preset.color} onClick={() => onChange({ ...paper, lineColor: preset.color })}><span style={{ backgroundColor: paper.color, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 7px, ${preset.color} 7px, ${preset.color} 8px)` }} />{preset.name}</button>)}</div></fieldset>
  </div>;
}
export function PenSettings({ pen, onSave, onClose, onDefault, onDelete, onDuplicate, onBack, canDelete = true }: { onBack?: () => void; canDelete?: boolean; pen: Pen; onSave: (pen: Pen) => void; onClose: () => void; onDefault: (pen: Pen) => void; onDelete: () => void; onDuplicate: (pen: Pen) => void }) {
  const [draft, setDraft] = useState(pen);
  const widths = fountainWidths(draft);
  const update = (patch: Partial<Pen>) => setDraft(p => ({ ...p, ...patch }));
  return <div className="ink-modal-scrim" onClick={onClose}><section className="ink-dialog" role="dialog" aria-modal="true" aria-label="Customize pen" onClick={e => e.stopPropagation()}>
    {onBack && <button className="ink-toolbox-back" onClick={() => { onSave(draft); onBack(); }}>← Back to toolbox</button>}
    <div className="ink-dialog-title"><h2>Customize your pen</h2><button onClick={onClose} aria-label="Close">×</button></div>
    <svg viewBox="0 0 300 70" className="ink-pen-preview">{draft.style === "fountain" ? <g stroke={draft.color} opacity={draft.opacity} strokeLinecap="round"><path d="M20 45 Q65 5 130 35" fill="none" strokeWidth={widths.min} /><path d="M155 35 Q220 65 280 20" fill="none" strokeWidth={widths.max} /></g> : <path d="M20 45 Q55 5 85 40 T150 35 T220 35 T280 20" fill="none" stroke={draft.color} strokeWidth={draft.width} opacity={draft.opacity} strokeLinecap="round" />}</svg>
    <div className="ink-settings-grid"><label>Name<input value={draft.name} onChange={e => update({ name: e.target.value })} /></label>
      <label>Style<select value={draft.style} onChange={e => update({ style: e.target.value as Pen["style"], ...(e.target.value === "highlighter" ? { opacity: .3, width: 20, pressure: 0 } : { opacity: 1, width: 2.5 }) })}>{["pen", "fountain", "pencil", "highlighter"].map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Colour<input type="color" value={draft.color} onChange={e => update({ color: e.target.value })} /></label>
      {draft.style === "fountain" ? <>
      <label>Minimum width: {widths.min.toFixed(1)} px<input type="range" min=".5" max="30" step=".1" value={widths.min} onChange={e => { const minWidth = Number(e.target.value); update({ minWidth, maxWidth: Math.max(minWidth, widths.max) }); }} /></label>
      <label>Maximum width: {widths.max.toFixed(1)} px<input type="range" min=".5" max="30" step=".1" value={widths.max} onChange={e => { const maxWidth = Number(e.target.value); update({ maxWidth, minWidth: Math.min(maxWidth, widths.min) }); }} /></label>
      <p>Fast strokes are thin. Slow strokes and holds widen up to your maximum.</p>
      </> : <label>Thickness · {draft.width} px<input type="range" min=".5" max={draft.style === "highlighter" ? 50 : 10} step=".1" value={draft.width} onChange={e => update({ width: Number(e.target.value) })} /></label>}
      {draft.style !== "fountain" && <label>Pressure<select value={draft.pressure} onChange={e => update({ pressure: Number(e.target.value) })}><option value="0">Off</option><option value="0.15">Low</option><option value="0.5">Medium</option><option value="1">High</option>{![0, .15, .5, 1].includes(draft.pressure) && <option value={draft.pressure}>Custom</option>}</select></label>}
      <label>Enhancement<input type="range" min="0" max="1" step=".05" value={draft.smoothing} onChange={e => update({ smoothing: Number(e.target.value) })} /></label>
      <label>Opacity<input type="range" min=".1" max="1" step=".05" value={draft.opacity} onChange={e => update({ opacity: Number(e.target.value) })} /></label>
    </div>
    <div className="ink-color-row">{["#20242c", "#2563eb", "#dc3545", "#16a34a", "#9333ea", "#f97316", "#ffffff"].map(color => <button key={color} style={{ background: color }} title={color} onClick={() => update({ color })} />)}</div>
    <div className="ink-actions"><button onClick={() => { onDefault(draft); onClose(); }}>Set as default</button><button onClick={() => { onDuplicate({ ...draft, id: uid(), name: `${draft.name} copy` }); onClose(); }}>Duplicate</button><button onClick={() => setDraft({ ...STARTER_PENS[0], id: pen.id, name: pen.name })}>Reset</button><button className="ink-danger" disabled={!canDelete} onClick={() => { onDelete(); onClose(); }}>Delete</button></div>
    <button className="ink-primary" onClick={() => { onSave(draft); onClose(); }}>Save pen</button>
  </section></div>;
}
