/**
 * AKILI V6 reactorPlugin - Capacitor bridge + web fallback.
 * KEEPS double-press + typing capability everywhere.
 */
export type ReactorMode = "everywhere" | "appOnly";
export function getReactorMode(): ReactorMode {
  try { return (localStorage.getItem("reactorMode") as ReactorMode) || "everywhere"; } catch { return "everywhere"; }
}
export function setReactorMode(m: ReactorMode) { try { localStorage.setItem("reactorMode", m); } catch {} }
function native(): any { return (window as any).AndroidInterface || (window as any).Capacitor?.Plugins?.Reactor || null; }
function fireDom(type: string, x: number, y: number) {
  try {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return false;
    el.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: y, bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: y, bubbles: true }));
    el.click();
    return true;
  } catch { return false; }
}
export async function reactorGlobalTap(x: number, y: number) {
  const n = native();
  if (n?.globalTap) return n.globalTap(x, y);
  if (n?.postMessage) return n.postMessage(JSON.stringify({ action: "tap", x, y }));
  return fireDom("tap", x, y);
}
export async function reactorGlobalDoubleTap(x: number, y: number) {
  const n = native();
  if (n?.globalDoubleTap) return n.globalDoubleTap(x, y);
  await reactorGlobalTap(x, y);
  await new Promise((r) => setTimeout(r, 110));
  return reactorGlobalTap(x, y);
}
export async function reactorGlobalLongPress(x: number, y: number, ms = 800) {
  const n = native();
  if (n?.globalLongPress) return n.globalLongPress(x, y, ms);
  return fireDom("longpress", x, y);
}
export async function reactorGlobalSwipe(x1: number, y1: number, x2: number, y2: number, ms = 350) {
  const n = native();
  if (n?.globalSwipe) return n.globalSwipe(x1, y1, x2, y2, ms);
  try { window.scrollBy({ top: y1 - y2, left: x1 - x2, behavior: "smooth" }); } catch {}
  return true;
}
export async function reactorGlobalDrag(x1: number, y1: number, x2: number, y2: number) {
  return reactorGlobalSwipe(x1, y1, x2, y2, 650);
}
/** KEEP typing capability: ACTION_SET_TEXT anywhere */
export async function reactorGlobalType(text: string) {
  const n = native();
  if (n?.globalType) return n.globalType(text);
  try {
    const a = document.activeElement as any;
    if (a && ("value" in a)) {
      a.value = text;
      a.dispatchEvent(new Event("input", { bubbles: true }));
      a.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    const inp = document.querySelector("input, textarea") as any;
    if (inp) { inp.focus(); inp.value = text; inp.dispatchEvent(new Event("input", { bubbles: true })); return true; }
  } catch {}
  return false;
}
export async function reactorOpenApp(pkgOrName: string) {
  const n = native();
  if (n?.openApp) return n.openApp(pkgOrName);
  return false;
}
export async function reactorPressBack() { const n = native(); if (n?.pressBack) return n.pressBack(); try { history.back(); } catch {} return true; }
export async function reactorPressHome() { const n = native(); if (n?.pressHome) return n.pressHome(); return true; }
export async function requestOverlayPermission() {
  const n = native(); if (n?.requestOverlayPermission) return n.requestOverlayPermission();
  return true;
}
export async function requestAccessibilityPermission() {
  const n = native(); if (n?.requestAccessibilityPermission) return n.requestAccessibilityPermission();
  return true;
}
