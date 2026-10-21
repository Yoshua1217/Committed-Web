/** Barrel button and inverted eraser, as exposed by browser/WebView Pointer Events. */
export function penEraserHeld(event: { pointerType: string; buttons: number }, nativeHeld: boolean | null = null) {
  return event.pointerType === "pen" && (Boolean(event.buttons & 32) || (nativeHeld ?? Boolean(event.buttons & 2)));
}

/** Android WebViews do not all forward the S Pen barrel button in `buttons`. */
export function nativePenButtonHeld(): boolean | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { CommittedStylus?: { isButtonPressed: () => boolean } }).CommittedStylus;
  return bridge ? bridge.isButtonPressed() : null;
}

/** A barrel-button press while hovering must never edit the page. */
export function penInContact(event: { buttons: number }) {
  return Boolean(event.buttons & (1 | 32));
}
