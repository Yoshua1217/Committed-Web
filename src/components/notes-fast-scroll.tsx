"use client";

import {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { MarkdownHeading } from "@/components/notes-markdown";

interface NotesFastScrollProps {
  headings: MarkdownHeading[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollContainerId: string;
}

type InteractionMode = "idle" | "scrub" | "outline";

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export default function NotesFastScroll({ headings, scrollContainerRef, scrollContainerId }: NotesFastScrollProps) {
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<InteractionMode>("idle");
  const [currentHeading, setCurrentHeading] = useState(headings[0] ?? null);
  const [selectedHeadingIndex, setSelectedHeadingIndex] = useState(0);
  const [overlayPosition, setOverlayPosition] = useState({ left: 0, top: 0 });
  const headingTopsRef = useRef<number[]>([]);
  const modeRef = useRef<InteractionMode>("idle");
  const startPointerRef = useRef<{ id: number; x: number; y: number; type: string } | null>(null);
  const selectedHeadingIndexRef = useRef(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measureFrameRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const outlineListRef = useRef<HTMLDivElement>(null);
  const outlineRowRefs = useRef<Array<HTMLDivElement | null>>([]);

  const changeMode = (nextMode: InteractionMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  };

  const clearHoldTimer = () => {
    if (!holdTimerRef.current) return;
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const headingIndexAt = useCallback((scrollTop: number) => {
    let index = 0;
    headingTopsRef.current.forEach((top, headingIndex) => {
      if (top <= scrollTop + 96) index = headingIndex;
    });
    return index;
  }, []);

  const updateScrollState = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const maximum = Math.max(1, container.scrollHeight - container.clientHeight);
    const headingIndex = headingIndexAt(container.scrollTop);
    setProgress(clamp(container.scrollTop / maximum));
    setCurrentHeading(headings[headingIndex] ?? headings[0] ?? null);
  }, [headingIndexAt, headings, scrollContainerRef]);

  const measure = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (measureFrameRef.current !== null) cancelAnimationFrame(measureFrameRef.current);
    measureFrameRef.current = requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect();
      headingTopsRef.current = headings.map((heading) => {
        const element = document.getElementById(heading.id);
        return element ? element.getBoundingClientRect().top - containerRect.top + container.scrollTop : 0;
      });
      setOverlayPosition({ left: containerRect.left + containerRect.width / 2, top: containerRect.top + containerRect.height / 2 });
      updateScrollState();
      measureFrameRef.current = null;
    });
  }, [headings, scrollContainerRef, updateScrollState]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !headings.length) return;
    const onScroll = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = requestAnimationFrame(() => {
        updateScrollState();
        scrollFrameRef.current = null;
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      clearHoldTimer();
      if (measureFrameRef.current !== null) cancelAnimationFrame(measureFrameRef.current);
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, [headings.length, measure, scrollContainerRef, updateScrollState]);

  const scrollFromPointer = (clientY: number, track: HTMLDivElement) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const rect = track.getBoundingClientRect();
    const ratio = clamp((clientY - rect.top) / rect.height);
    const nextTop = ratio * Math.max(0, container.scrollHeight - container.clientHeight);
    const headingIndex = headingIndexAt(nextTop);
    container.scrollTop = nextTop;
    setProgress(ratio);
    setCurrentHeading(headings[headingIndex] ?? headings[0] ?? null);
  };

  const enterOutlineMode = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || modeRef.current === "outline") return;
    clearHoldTimer();
    const headingIndex = headingIndexAt(container.scrollTop);
    selectedHeadingIndexRef.current = headingIndex;
    setSelectedHeadingIndex(headingIndex);
    changeMode("outline");
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(12);
  }, [headingIndexAt, scrollContainerRef]);

  const selectOutlineHeading = (clientY: number) => {
    const list = outlineListRef.current;
    if (!list || !headings.length) return;
    const rect = list.getBoundingClientRect();
    const edgeZone = Math.min(58, rect.height * 0.18);
    if (clientY < rect.top + edgeZone) {
      list.scrollTop -= (rect.top + edgeZone - clientY) * 0.38;
    } else if (clientY > rect.bottom - edgeZone) {
      list.scrollTop += (clientY - (rect.bottom - edgeZone)) * 0.38;
    }
    const pointerY = clamp(clientY, rect.top, rect.bottom);
    let nextIndex = selectedHeadingIndexRef.current;
    let nearestDistance = Number.POSITIVE_INFINITY;
    outlineRowRefs.current.forEach((row, index) => {
      if (!row) return;
      const rowRect = row.getBoundingClientRect();
      const rowCenter = rowRect.top + rowRect.height / 2;
      const distance = Math.abs(rowCenter - pointerY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nextIndex = index;
      }
    });
    if (nextIndex === selectedHeadingIndexRef.current) return;
    selectedHeadingIndexRef.current = nextIndex;
    setSelectedHeadingIndex(nextIndex);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(5);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = scrollContainerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      setOverlayPosition({ left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 });
    }
    startPointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, type: event.pointerType };
    event.currentTarget.setPointerCapture(event.pointerId);
    changeMode("scrub");
    scrollFromPointer(event.clientY, event.currentTarget);
    if (event.pointerType === "touch") holdTimerRef.current = setTimeout(enterOutlineMode, 440);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = startPointerRef.current;
    if (!start || start.id !== event.pointerId) return;
    const horizontalPull = start.x - event.clientX;
    const verticalMovement = Math.abs(start.y - event.clientY);
    if (start.type === "touch" && verticalMovement > 9) clearHoldTimer();
    if (modeRef.current !== "outline" && horizontalPull >= 42) enterOutlineMode();
    if (modeRef.current === "outline") selectOutlineHeading(event.clientY);
    else scrollFromPointer(event.clientY, event.currentTarget);
  };

  const jumpToHeading = (headingIndex: number) => {
    const container = scrollContainerRef.current;
    const heading = headings[headingIndex];
    const element = heading ? document.getElementById(heading.id) : null;
    if (!container || !element) return;
    const containerRect = container.getBoundingClientRect();
    const top = element.getBoundingClientRect().top - containerRect.top + container.scrollTop - 24;
    container.scrollTo({ top, behavior: "smooth" });
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = startPointerRef.current;
    if (!start || start.id !== event.pointerId) return;
    clearHoldTimer();
    if (modeRef.current === "outline") jumpToHeading(selectedHeadingIndexRef.current);
    startPointerRef.current = null;
    changeMode("idle");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const cancelDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startPointerRef.current?.id !== event.pointerId) return;
    clearHoldTimer();
    startPointerRef.current = null;
    changeMode("idle");
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const step = event.key === "PageDown" || event.key === "PageUp" ? container.clientHeight * 0.8 : 72;
    if (event.key === "ArrowDown" || event.key === "PageDown") container.scrollBy({ top: step, behavior: "smooth" });
    else if (event.key === "ArrowUp" || event.key === "PageUp") container.scrollBy({ top: -step, behavior: "smooth" });
    else if (event.key === "Home") container.scrollTo({ top: 0, behavior: "smooth" });
    else if (event.key === "End") container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    else return;
    event.preventDefault();
  };

  if (!headings.length) return null;

  const selectedHeading = headings[selectedHeadingIndex] ?? headings[0];

  return <aside className={`notes-fast-scroll is-${mode}`} aria-label="Fast scroll">
    <div
      className="notes-fast-scroll-track"
      role="scrollbar"
      aria-label="Fast scroll through note sections"
      aria-controls={scrollContainerId}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-valuetext={currentHeading?.label ?? "Beginning"}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={cancelDragging}
      onKeyDown={handleKeyDown}
    >
      <span className="notes-fast-scroll-hint">Pull inward for sections</span>
      <span className="notes-fast-scroll-line" aria-hidden="true" />
      <span className="notes-fast-scroll-thumb" style={{ top: `${2 + progress * 96}%` }} aria-hidden="true" />
    </div>

    {mode === "scrub" && currentHeading && <div className="notes-fast-scroll-overlay" style={{ left: overlayPosition.left, top: overlayPosition.top }} role="status">
      <small>H{currentHeading.level}<i />{Math.round(progress * 100)}%</small>
      <strong>{currentHeading.label}</strong>
    </div>}

    {mode === "outline" && <div className="notes-fast-scroll-picker" role="presentation">
      <header>
        <span><small>Page outline</small><strong>Release to jump</strong></span>
        <em>{selectedHeadingIndex + 1} of {headings.length}</em>
      </header>
      <div className="notes-fast-scroll-picker-list" ref={outlineListRef} role="listbox" aria-label="Note sections">
        {headings.map((heading, index) => <div
          key={heading.id}
          ref={(element) => { outlineRowRefs.current[index] = element; }}
          id={`fast-scroll-option-${index}`}
          role="option"
          aria-selected={index === selectedHeadingIndex}
          className={`is-level-${heading.level}${index === selectedHeadingIndex ? " is-selected" : ""}`}
        >
          <small>H{heading.level}</small>
          <span>{heading.label}</span>
          <i aria-hidden="true" />
        </div>)}
      </div>
      <footer><span />{selectedHeading.label}</footer>
    </div>}
  </aside>;
}
