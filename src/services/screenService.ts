/**
 * AKILI V6 screenService - Screen Eyes (see everything).
 * PWA: html2canvas + DOM elements. Android: native MediaProjection.
 */
export interface ScreenElement { x: number; y: number; text: string; type: string; }
export interface ScreenData { ocrText: string; elements: ScreenElement[]; timestamp: number; }
export async function see(): Promise<ScreenData> {
  const elements: ScreenElement[] = [];
  try {
    const nodes = document.querySelectorAll("button, input, a, [role=button], textarea, select");
    nodes.forEach((el) => {
      try {
        const r = (el as HTMLElement).getBoundingClientRect();
        const t = ((el as HTMLElement).innerText || (el as any).value || (el as HTMLElement).getAttribute?.("aria-label") || "").slice(0, 80);
        if (r.width > 0 && r.height > 0) elements.push({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: t, type: (el as HTMLElement).tagName.toLowerCase() });
      } catch {}
    });
  } catch {}
  let ocrText = "";
  try { ocrText = document.body?.innerText?.slice(0, 4000) || ""; } catch {}
  try {
    const n = (window as any).AndroidInterface;
    if (n?.takeScreenshot) {
      const shot = await n.takeScreenshot();
      if (shot?.ocrText) ocrText = shot.ocrText;
      if (shot?.elements) return { ocrText, elements: shot.elements, timestamp: Date.now() };
    }
  } catch {}
  try {
    const mod = await import("html2canvas").catch(() => null) as any;
    if (mod) {
      const canvas = await mod.default(document.body);
      try {
        const T = await import("tesseract.js").catch(() => null) as any;
        if (T?.recognize) {
          const res = await T.recognize(canvas, "eng");
          if (res?.data?.text) ocrText = res.data.text.slice(0, 4000);
        }
      } catch {}
    }
  } catch {}
  return { ocrText, elements: elements.slice(0, 120), timestamp: Date.now() };
}
export async function detectGameBoard(ocrText: string, elements: ScreenElement[]) {
  return { isGame: /game|play|score|level|win|puzzle|candy|chess/i.test(ocrText), gameName: "current-screen-game", boardBounds: { x: 0, y: 120, w: 360, h: 500 } };
}
