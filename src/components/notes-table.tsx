"use client";

import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { changeTable, decodeTableCell, encodeTableCell, NoteTable, TableAction } from "@/lib/notes-tables";
import styles from "./notes-table.module.css";

function Cell({ value, label, renderInline, onFocus, onChange }: { value: string; label: string; renderInline: (value: string) => ReactNode; onFocus: () => void; onChange?: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ text: "", source: "" });
  // Preserve in-progress whitespace, but accept values restored by undo/redo.
  const text = draft.source === value ? draft.text : decodeTableCell(value);
  if (!onChange) return <div className={styles.cellContent}>{renderInline(decodeTableCell(value))}</div>;
  return editing ? <textarea autoFocus aria-label={label} value={text} rows={Math.max(1, text.split("\n").length)}
    onBlur={() => setEditing(false)}
    onKeyDown={(event) => { if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) { event.preventDefault(); event.currentTarget.blur(); } }}
    onChange={(event) => { const encoded = encodeTableCell(event.target.value); setDraft({ text: event.target.value, source: encoded.trim() }); onChange(encoded); }} />
    : <button type="button" className={styles.cellContent} aria-label={label} onFocus={() => { setDraft({ text: decodeTableCell(value), source: value }); setEditing(true); onFocus(); }}>{renderInline(decodeTableCell(value)) || "\u00a0"}</button>;
}

export default function NotesTable({ table, sourceLine, renderInline, onChange }: { table: NoteTable; sourceLine?: number; renderInline: (value: string) => ReactNode; onChange?: (table: NoteTable | null, historyGroup?: string) => void }) {
  const [selected, setSelected] = useState({ row: 0, column: 0 });
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const row = Math.min(selected.row, table.rows.length - 1);
  const column = Math.min(selected.column, table.alignments.length - 1);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) detailsRef.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  const closeMenu = () => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
      detailsRef.current.querySelector("summary")?.focus();
    }
  };
  const action = (value: TableAction) => { onChange?.(changeTable(table, value, row, column)); closeMenu(); };
  const cells = (values: string[], rowIndex: number) => values.map((value, columnIndex) => {
    const Tag = rowIndex === 0 ? "th" : "td";
    return <Tag key={columnIndex} scope={rowIndex === 0 ? "col" : undefined} style={{ textAlign: table.alignments[columnIndex] }} className={onChange && row === rowIndex && column === columnIndex ? styles.selected : ""}>
      <Cell value={value} label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`} renderInline={renderInline} onFocus={() => setSelected({ row: rowIndex, column: columnIndex })} onChange={onChange ? (value) => {
        const rows = table.rows.map((cells) => [...cells]);
        rows[rowIndex][columnIndex] = value;
        onChange({ ...table, rows }, `cell-${rowIndex}-${columnIndex}`);
      } : undefined} />
    </Tag>;
  });
  return <div className={styles.wrapper} data-table-line={sourceLine}>
    {onChange && <details ref={detailsRef} className={styles.controls} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeMenu(); } }}>
      <summary aria-label="Table options" title="Table options">···</summary>
      <div className={styles.menu}>
        <small>Row {row + 1} · Column {column + 1}</small>
        <button type="button" onClick={() => action("row-before")}>Add row above</button>
        <button type="button" onClick={() => action("row-after")}>Add row below</button>
        <button type="button" onClick={() => action("column-before")}>Add column left</button>
        <button type="button" onClick={() => action("column-after")}>Add column right</button>
        <button type="button" disabled={table.rows.length === 1} onClick={() => action("remove-row")}>Remove selected row</button>
        <button type="button" disabled={table.alignments.length === 1} onClick={() => action("remove-column")}>Remove selected column</button>
        <label>Column alignment<select aria-label="Column alignment" value={table.alignments[column]} onChange={(event) => {
          const alignments = [...table.alignments];
          alignments[column] = event.target.value as typeof alignments[number];
          onChange({ ...table, alignments });
        }}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        <button type="button" className={styles.danger} onClick={() => onChange(null)}>Delete table</button>
      </div>
    </details>}
    <div className={styles.scroll}><table aria-label="Note table"><thead><tr>{cells(table.rows[0], 0)}</tr></thead><tbody>{table.rows.slice(1).map((values, index) => <tr key={index + 1}>{cells(values, index + 1)}</tr>)}</tbody></table></div>
  </div>;
}

export function TableSizePicker({ onInsert, onClose }: { onInsert: (rows: number, columns: number) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [hover, setHover] = useState<{ rows: number; columns: number } | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const size = hover ?? { rows, columns };
  return <dialog ref={dialogRef} className={styles.picker} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); onInsert(rows, columns); }}>
      <header><h2 id={titleId}>Insert table</h2><button type="button" onClick={onClose} aria-label="Close table picker">×</button></header>
      <p>Choose your columns and rows.</p>
      <div className={styles.grid} onMouseLeave={() => setHover(null)} aria-label="Table size presets">
        {Array.from({ length: 64 }, (_, index) => {
          const r = Math.floor(index / 8) + 1;
          const c = index % 8 + 1;
          return <button key={index} type="button" aria-label={`${c} columns, ${r} rows`} className={r <= size.rows && c <= size.columns ? styles.highlight : ""} onMouseEnter={() => setHover({ rows: r, columns: c })} onFocus={() => setHover({ rows: r, columns: c })} onBlur={() => setHover(null)} onClick={() => { setRows(r); setColumns(c); setHover(null); }} />;
        })}
      </div>
      <output aria-live="polite">{size.columns} columns × {size.rows} rows</output>
      <div className={styles.dimensions}>
        <label>Columns<input autoFocus type="number" min={1} max={20} required value={columns || ""} onChange={(event) => { setHover(null); setColumns(Number(event.target.value)); }} /></label>
        <label>Rows<input type="number" min={1} max={50} required value={rows || ""} onChange={(event) => { setHover(null); setRows(Number(event.target.value)); }} /></label>
      </div>
      <small>The first row is a header. Resize anytime from the table’s ··· menu.</small>
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit">Insert table</button></footer>
    </form>
  </dialog>;
}
