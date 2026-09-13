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
