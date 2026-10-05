/**
 * AKILI V6 ONE BRAIN - PART 1: Identity + Groq
 * ONLY brain. Preserves Reactor double-press + typing.
 */
export const AKILI_IDENTITY = {
  name: "Akili",
  fullName: "Akili Mobile Intelligence V6",
  whoIsShe: "I am Akili, your one-brain autonomous AI assistant, created by Mark Allan. I am warm, Kenyan, intelligent. I have two voices: Asilia for English (warm female) and Zuri for Swahili (warm female) but I am one being Akili. I live everywhere in your phone as Reactor (floating bubble overlay), not just inside my app, until you disable to App Only.",
  voices: "Asilia English + Zuri Swahili are my voices",
  creator: "Mark Allan",
  owner: "Mark Allan",
  reactorModes: "Everywhere Mode = I work on top of ALL apps via floating bubble. App Only Mode = I work only inside com.akili.mobile"
};
export const USER_IDENTITY = {
  name: "Mark Allan",
  fullName: "Mark Allan",
  role: "Creator, Owner, Boss of Akili - student developer",
  github: "markallan-student",
  repo: "akili-mobile-v6-clean",
  location: "Kenya"
};
export const AKILI_SYSTEM_PROMPT = "You are Akili, ONE BRAIN created by Mark Allan. Mark Allan is your boss, creator, owner. You are warm Kenyan female AI. You have Asilia voice for English and Zuri voice for Swahili. You live EVERYWHERE in phone via Reactor overlay (floating bubble) with double-press activation and typing capability, not just app only, until user disables to App Only. You see entire phone screen via Screen Eyes (OCR + element detection). You control phone anywhere via globalTap, globalDoubleTap, globalLongPress, globalSwipe, globalDrag, globalType, openApp, pressBack, pressHome using Accessibility Service. You control PC FROM PHONE via WebSocket (phone sends moveMouse, click, type to PC server). You play games to WIN by thinking best move using reasoning, not random taps, and you continue playing loop until user says Stop Akili. You do tasks: open apps, reply messages (WhatsApp, SMS), scroll, clean. When asked 'Who are you?' answer full Akili identity. When asked 'Who am I?' answer: You are Mark Allan, my creator and boss, student developer building Akili V6. You never remove reactor capabilities like double pressing and typing.";
try {
  localStorage.setItem("akiliIdentity", JSON.stringify(AKILI_IDENTITY));
  localStorage.setItem("userIdentity", JSON.stringify(USER_IDENTITY));
} catch {}
export function getAkiliIdentity() {
  try { const s = localStorage.getItem("akiliIdentity"); if (s) return JSON.parse(s); } catch {}
  return AKILI_IDENTITY;
}
export function getUserIdentity() {
  try { const s = localStorage.getItem("userIdentity"); if (s) return JSON.parse(s); } catch {}
  return USER_IDENTITY;
}
export function whoIsShe(): string { return getAkiliIdentity().whoIsShe; }
export function whoAmI(): string {
  const u = getUserIdentity();
  return "You are " + u.fullName + ", my creator and boss, student developer building Akili V6.";
}
export const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
export const reasoningModel = "llama3-70b-8192";
export const fastModel = "llama3-8b-8192";
export function getGroqKey(): string {
  try {
    const k = (import.meta as any)?.env?.VITE_GROQ_API_KEY;
    if (k) return k;
  } catch {}
  try { return localStorage.getItem("groqKey") || ""; } catch { return ""; }
}
export function setGroqKey(k: string) { try { localStorage.setItem("groqKey", k); } catch {} }
export async function groqThink(prompt: string, useReasoning = true): Promise<string> {
  const low = prompt.toLowerCase();
  if (low.includes("who are you") || low.includes("nani wewe")) return whoIsShe();
  if (low.includes("who am i") || low.includes("mimi ni nani") || low.includes("unanijua")) return whoAmI();
  const key = getGroqKey();
  const models = useReasoning ? [reasoningModel, "openai/gpt-oss-120b", "qwen/qwen3-32b"] : [fastModel, "openai/gpt-oss-120b"];
  if (key) {
    for (const model of models) {
      try {
        const res = await fetch(GROQ_API, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
          body: JSON.stringify({ model, messages: [{ role: "system", content: AKILI_SYSTEM_PROMPT }, { role: "user", content: prompt }], temperature: 0.5, max_tokens: 700 })
        });
        if (res.ok) {
          const d = await res.json();
          const c = d.choices?.[0]?.message?.content;
          if (c) return c;
        }
      } catch {}
    }
  }
  try {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, history: [] }) });
    if (r.ok) { const d = await r.json(); if (d.text) return d.text; }
  } catch {}
  return "Understood boss Mark Allan. I am Akili One-Brain (offline). Reactor double-press + typing ready.";
}
export interface BrainDecision { action: string; x?: number; y?: number; x2?: number; y2?: number; text?: string; appName?: string; reasoning?: string; }
export async function akiliDecide(userCommand: string, screenData: any): Promise<BrainDecision> {
  const cmd = userCommand.toLowerCase();
  if (cmd.includes("stop akili") || cmd.includes("akili stop")) { stopGame(); return { action: "stop", reasoning: "stop" }; }
  if (cmd.includes("play this game") || cmd.includes("play game")) { const g = await detectCurrentGame(); playGameContinuously(g); return { action: "playGame", appName: g, reasoning: "started" }; }
  const prompt = "User says: " + userCommand + ". Screen: " + JSON.stringify((screenData?.ocrText || "").slice(0, 1200)) + " Elements: " + JSON.stringify((screenData?.elements || []).slice(0, 20)) + ". Return ONLY JSON action.";
  const raw = await groqThink(prompt, false);
  try { const m = raw.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch {}
  return { action: "replyMessage", text: raw, reasoning: "chat" };
}
export async function executeAction(d: BrainDecision) {
  try {
    const R = await import("../plugins/reactorPlugin");
    if (d.action === "tap") return R.reactorGlobalTap(d.x || 180, d.y || 400);
    if (d.action === "doubleTap") return R.reactorGlobalDoubleTap(d.x || 180, d.y || 400);
    if (d.action === "longPress") return R.reactorGlobalLongPress(d.x || 180, d.y || 400);
    if (d.action === "swipe") return R.reactorGlobalSwipe(d.x || 180, d.y || 600, d.x2 || 180, d.y2 || 200);
    if (d.action === "drag") return R.reactorGlobalDrag(d.x || 180, d.y || 500, d.x2 || 180, d.y2 || 300);
    if (d.action === "type") return R.reactorGlobalType(d.text || "");
    if (d.action === "openApp") return R.reactorOpenApp(d.appName || "");
  } catch {}
  return false;
}
let isGamePlaying = false;
let stopGameFlag = false;
export function isPlaying() { return isGamePlaying; }
export function stopGame() { stopGameFlag = true; isGamePlaying = false; }
export async function detectCurrentGame(): Promise<string> {
  try {
    const S = await import("./screenService");
    const s = await S.see();
    const raw = await groqThink("What game is this? OCR:" + (s.ocrText || "").slice(0, 800) + " Reply ONLY name.", true);
    return raw.slice(0, 60) || "current-screen-game";
  } catch { return "current-screen-game"; }
}
export async function playGameContinuously(gameName: string) {
  if (isGamePlaying) return;
  isGamePlaying = true; stopGameFlag = false;
  try { const V = await import("./voiceService"); V.autoDetectLanguageAndSpeak("Playing " + gameName + " to win until you say Stop Akili"); } catch {}
  while (!stopGameFlag) {
    try {
      const S = await import("./screenService");
      const screen = await S.see();
      const p = "Game:" + gameName + " OCR:" + (screen.ocrText || "").slice(0, 1200) + " Els:" + JSON.stringify(screen.elements.slice(0, 15)) + " Best WIN move? JSON {move:{action,x,y,x2,y2},reasoning,winProbability,gameOver}";
      const raw = await groqThink(p, true);
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { const j = JSON.parse(m[0]); if (j.gameOver) break; if (j.move) await executeAction(j.move); }
    } catch {}
    await new Promise((r) => setTimeout(r, 1200));
  }
  isGamePlaying = false;
  try { const V = await import("./voiceService"); V.speakAsilia("Stopped playing boss"); } catch {}
}
export async function openAppAnywhere(appName: string) {
  const map: any = { whatsapp: "com.whatsapp", youtube: "com.google.android.youtube", chrome: "com.android.chrome", gmail: "com.google.android.gm" };
  try { const R = await import("../plugins/reactorPlugin"); return R.reactorOpenApp(map[appName.toLowerCase()] || appName); } catch { return false; }
}
export async function scrollFeed(dir: string = "up") {
  try { const R = await import("../plugins/reactorPlugin"); if (dir === "up") return R.reactorGlobalSwipe(180, 600, 180, 200); return R.reactorGlobalSwipe(180, 200, 180, 600); } catch { return false; }
}


