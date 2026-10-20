/** Page bottoms are ordered, so tracking a long document needs only log(n) layout reads. */
export function inkPageAtViewport(container: HTMLElement, inset = 80): HTMLElement | undefined {
  const top = Math.max(0, container.getBoundingClientRect().top) + inset;
  const pages = container.querySelectorAll<HTMLElement>("[data-pdf-page-id]");
  let left = 0, right = pages.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if (pages[middle].getBoundingClientRect().bottom > top) right = middle;
    else left = middle + 1;
  }
  return pages[left];
}

/** Animate vertical mouse-wheel ticks across a horizontal tab strip. Native
 * horizontal trackpad and touch scrolling keep their own browser momentum. */
export function bindInkTabScroll(element: HTMLElement): () => void {
  let frame: number | null = null, target = element.scrollLeft, lastTime = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stop = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; lastTime = 0; target = element.scrollLeft; };
  const step = (time: number) => {
    const elapsed = lastTime ? Math.min(64, time - lastTime) : 16.67;
    lastTime = time;
    target = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, target));
    const distance = target - element.scrollLeft;
    element.scrollLeft += Math.abs(distance) < 1 ? distance : distance * (1 - Math.exp(-elapsed / 45));
    if (Math.abs(target - element.scrollLeft) > 1) frame = requestAnimationFrame(step);
    else { element.scrollLeft = target; frame = null; lastTime = 0; }
  };
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.deltaX || !event.deltaY) { stop(); return; }
    const max = element.scrollWidth - element.clientWidth;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1);
    if (frame !== null && delta * (target - element.scrollLeft) < 0) stop();
    const from = frame === null ? element.scrollLeft : target;
    const next = Math.max(0, Math.min(max, from + delta));
    if (max <= 0 || next === from) return;
    event.preventDefault(); target = next;
    if (reducedMotion.matches) { stop(); element.scrollLeft = next; target = next; }
    else if (frame === null) frame = requestAnimationFrame(step);
  };
  element.addEventListener("wheel", wheel, { passive: false });
  element.addEventListener("pointerdown", stop, { passive: true });
  element.addEventListener("keydown", stop);
  return () => { stop(); element.removeEventListener("wheel", wheel); element.removeEventListener("pointerdown", stop); element.removeEventListener("keydown", stop); };
}

/** Capture the page stack and its scrolling ancestors before a toolbar update. */
export function preserveInkScroll(root: HTMLElement): () => void {
  const elements = new Set<Element>(root.querySelectorAll(".ink-pdf-scroll"));
  for (let element: HTMLElement | null = root; element; element = element.parentElement) elements.add(element);
  if (root.ownerDocument.scrollingElement) elements.add(root.ownerDocument.scrollingElement);
  const positions = [...elements].map(element => ({ element, top: element.scrollTop, left: element.scrollLeft }));
  return () => {
    for (const { element, top, left } of positions) {
      if (!element.isConnected) continue;
      if (element.scrollTop !== top) element.scrollTop = top;
      if (element.scrollLeft !== left) element.scrollLeft = left;
    }
  };
}

/** Match the visible point on a page even when read/edit modes use different sizes. */
export function preserveInkReadingPosition(root: HTMLElement): (() => void) | null {
  const container = root.querySelector<HTMLElement>(".ink-pdf-scroll");
  if (!container) return null;
  const top = container.getBoundingClientRect().top;
  const pages = [...container.querySelectorAll<HTMLElement>("[data-pdf-page-id]")];
  const page = pages.find(element => element.getBoundingClientRect().bottom > top);
  if (!page) return null;
  const bounds = page.getBoundingClientRect(), id = page.dataset.pdfPageId;
  const fraction = (top - bounds.top) / Math.max(1, bounds.height);
  const left = container.scrollLeft;
  return () => {
    const next = root.querySelector<HTMLElement>(".ink-pdf-scroll");
    const target = [...(next?.querySelectorAll<HTMLElement>("[data-pdf-page-id]") ?? [])].find(element => element.dataset.pdfPageId === id);
    if (!next || !target) return;
    const rect = target.getBoundingClientRect();
    next.scrollTop += rect.top + fraction * rect.height - next.getBoundingClientRect().top;
    next.scrollLeft = left;
  };
}
