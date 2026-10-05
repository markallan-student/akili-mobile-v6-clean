/**
 * AKILI V6 pcControlService - PHONE is controller, PC is controlled.
 * Connects to pc-server/pc-server.js over WebSocket :8080.
 */
let ws: WebSocket | null = null;
let pcIP = "";
try { pcIP = localStorage.getItem("pcIP") || ""; } catch {}
export function getPcIP() { return pcIP; }
export function isPcConnected() { return !!ws && ws.readyState === 1; }
export function connectToPC(ip: string): Promise<boolean> {
  pcIP = ip.trim();
  try { localStorage.setItem("pcIP", pcIP); } catch {}
  return new Promise((resolve) => {
    try { ws?.close(); } catch {}
    try {
      ws = new WebSocket("ws://" + pcIP + ":8080");
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
      setTimeout(() => { if (!isPcConnected()) { try { ws?.close(); } catch {} resolve(false); } }, 6000);
    } catch { resolve(false); }
  });
}
export function disconnectPC() { try { ws?.close(); } catch {} ws = null; }
function send(o: any) { try { if (isPcConnected()) ws!.send(JSON.stringify(o)); } catch {} }
export function pcMoveMouse(x: number, y: number) { send({ action: "moveMouse", x, y }); }
export function pcClick() { send({ action: "click" }); }
export function pcDoubleClick() { send({ action: "doubleClick" }); }
export function pcType(text: string) { send({ action: "type", text }); }
export function pcOpenApp(name: string) { send({ action: "openApp", name }); }
export function pcPressKey(key: string) { send({ action: "keyPress", key }); }
