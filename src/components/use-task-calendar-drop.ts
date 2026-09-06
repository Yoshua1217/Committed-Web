"use client";

import { useEffect, useRef, useState, type DragEvent, type RefObject } from "react";
import type { Task } from "@/lib/types";
import { TASK_DRAG_TYPE, taskDropBlock } from "@/lib/task-calendar-drop";

export function useTaskCalendarDrop({ task, days, columnsRef, scrollRef, hourHeight, onDrop }: {
  task: Task | null; days: Date[]; columnsRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>; hourHeight: number;
  onDrop: (taskId: string, start: Date) => void;
}) {
  const [preview, setPreview] = useState<{ taskId: string; start: Date; end: Date } | null>(null);
  const point = useRef<{ x: number; y: number } | null>(null);

  const blockAt = (x: number, y: number) => {
    const columns = columnsRef.current;
    return task && columns ? taskDropBlock(task, days, columns.getBoundingClientRect(), x, y, hourHeight) : null;
  };
  const clear = () => { point.current = null; setPreview(null); };

  useEffect(() => {
    if (!task) return;
    let frame = 0;
    let previousTime = 0;
    const tick = (time: number) => {
      const cursor = point.current;
      const scroll = scrollRef.current;
      const columns = columnsRef.current;
      if (cursor && scroll && columns) {
        const viewport = scroll.getBoundingClientRect();
        const elapsed = Math.min(32, previousTime ? time - previousTime : 16);
        const edge = 48;
        const velocity = cursor.y < viewport.top + edge ? -Math.min(1, (viewport.top + edge - cursor.y) / edge)
          : cursor.y > viewport.bottom - edge ? Math.min(1, (cursor.y - viewport.bottom + edge) / edge) : 0;
        scroll.scrollTop += velocity * elapsed * 0.6;
        const block = taskDropBlock(task, days, columns.getBoundingClientRect(), cursor.x, cursor.y, hourHeight);
        setPreview((current) => block ? current?.taskId === task.id && current.start.getTime() === block.start.getTime() && current.end.getTime() === block.end.getTime() ? current : { taskId: task.id, ...block } : null);
      }
      previousTime = time;
      frame = requestAnimationFrame(tick);
    };
    const reset = () => { point.current = null; setPreview(null); };
    frame = requestAnimationFrame(tick);
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    return () => { cancelAnimationFrame(frame); point.current = null; window.removeEventListener("dragend", reset); window.removeEventListener("drop", reset); };
  }, [task, days, columnsRef, scrollRef, hourHeight]);

  return {
    preview: task && preview?.taskId === task.id ? preview : null,
    handlers: {
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        if (!task || !event.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
        const block = blockAt(event.clientX, event.clientY);
        if (!block) { clear(); return; }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        point.current = { x: event.clientX, y: event.clientY };
        setPreview((current) => current?.taskId === task.id && current.start.getTime() === block.start.getTime() ? current : { taskId: task.id, ...block });
      },
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) clear();
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        if (!task || event.dataTransfer.getData(TASK_DRAG_TYPE) !== task.id) return;
        event.preventDefault();
        event.stopPropagation();
        const block = blockAt(event.clientX, event.clientY);
        clear();
        if (block) onDrop(task.id, block.start);
      },
    },
  };
}
