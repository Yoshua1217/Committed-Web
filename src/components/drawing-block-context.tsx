"use client";
import { createContext, useContext, type ReactNode } from "react";
import { TbGeometry } from "react-icons/tb";

export const DrawingBlockContext = createContext<{
  create: () => string;
  insert: (source: string) => void;
  render: (id: string) => ReactNode;
} | null>(null);

export function DrawingInsertButton({ onInsert }: { onInsert?: (source: string) => void }) {
  const drawing = useContext(DrawingBlockContext);
  if (!drawing) return null;
  return <button type="button" title="Insert drawing block" aria-label="Insert drawing block" onClick={() => (onInsert ?? drawing.insert)(drawing.create())}><TbGeometry size={18} /><span>Drawing</span></button>;
}

export function DrawingBlock({ id }: { id: string }) {
  const drawing = useContext(DrawingBlockContext);
  return <section className="notes-drawing-block" aria-label="Embedded drawing">{drawing?.render(id) ?? <p>Open this note to view its drawing.</p>}</section>;
}
