/**
 * AKILI OS Neural Voice Service with AI Brain Language Detection
 * - Brain-powered language detection (Groq / Gemini) recognizes ANY Swahili / Sheng word
 * - en-KE-AsiliaNeural (English Kenyan warm)
 * - sw-KE-ZuriNeural (Swahili Sheng expert)
 */

export const EDGE_VOICES = {
  asilia: {
    id: 'en-KE-AsiliaNeural',
    name: 'Asilia (English Kenyan Warm) -> en-KE-AsiliaNeural',
    shortName: 'Asilia (English Kenyan Warm)',
    lang: 'en-KE',
    pitch: 1.15,
    rate: 0.88,
    volume: 1.0,
    role: 'English Kenyan Warm Voice'
  },
  zuri: {
    id: 'sw-KE-ZuriNeural',
    name: 'Zuri (Swahili Sheng Expert) -> sw-KE-ZuriNeural',
    shortName: 'Zuri (Swahili Sheng Expert)',
    lang: 'sw-KE',
    pitch: 1.15,
    rate: 0.88,
    volume: 1.0,
    role: 'Swahili & Sheng Expert Voice'
  }
} as const;

export type VoiceMode = 'auto' | 'zuri' | 'asilia' | string;

// Memory cache for language detection to ensure 0ms latency on repeated phrases
const langCache = new Map<string, 'sw' | 'en'>();

/**
 * Heuristic fallback for offline use: checks grammatical morpho-phonology of Swahili
 * (Bantu syllable structures, high vowel density, open syllable endings, common affixes)
 */
function offlineSwahiliHeuristic(text: string): boolean {
  if (!text || !text.trim()) return false;
  const clean = text.toLowerCase().replace(/[^a-z\s]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  let swPoints = 0;
  for (const w of words) {
    // Swahili words almost always end in vowels (a, e, i, o, u)
    if (/[aeiou]$/.test(w) && w.length >= 2) swPoints += 0.5;
    // Common Swahili morphological prefixes / affixes
    if (/^(ku|wa|ya|ki|vi|za|tu|mu|ni|ha|si|ali|uli|ali|ili|tuli|wali|ana|una|ina|tuna|wana|ata|uta|ita|tuta|wata|ame|ume|ime|tume|wame)/.test(w)) {
      swPoints += 1.5;
    }
    // Specific Swahili letter combinations like 'ng\'', 'ny', 'ch', 'dh', 'gh', 'sh', 'th'
    if (/(ny|ng|sh|mw|bw|ch|dh|gh|th)/.test(w)) {
      swPoints += 0.5;
    }
  }

  return (swPoints / words.length) >= 1.2;
}

export const isSwahiliOrSheng = offlineSwahiliHeuristic;

/**
 * SMART BRAIN-POWERED LANGUAGE DETECTOR:
 * Uses Groq / Gemini via /api/detect-lang to detect ANY Swahili or Sheng word dynamically
 */
export async function detectLanguageSmart(text: string): Promise<'sw' | 'en'> {
  if (!text || !text.trim()) return 'en';
  const trimmed = text.trim();

  // 1. Check memory cache
  const cached = langCache.get(trimmed);
  if (cached) {
    return cached;
  }

  // 2. Query AI Brain detection endpoint
  try {
    const res = await fetch('/api/detect-lang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed.slice(0, 350) })
    });

    if (res.ok) {
      const data = await res.json();
      const detected: 'sw' | 'en' = data.lang === 'sw' ? 'sw' : 'en';
      langCache.set(trimmed, detected);
      console.log(`[Akili Brain Detection]: "${trimmed.slice(0, 40)}..." -> ${detected} (Using ${detected === 'sw' ? 'Zuri' : 'Asilia'})`);
      return detected;
    }
  } catch (err) {
    console.warn('[Akili Brain Detection fallback to offline]:', err);
  }

  // 3. Offline Heuristic Fallback
  const isSw = offlineSwahiliHeuristic(trimmed);
  const detected = isSw ? 'sw' : 'en';
  langCache.set(trimmed, detected);
  console.log(`[Akili Heuristic Detection]: "${trimmed.slice(0, 40)}..." -> ${detected}`);
  return detected;
}

export interface ResolvedVoiceInfo {
  voiceKey: 'zuri' | 'asilia';
  edgeVoiceId: string;
  name: string;
  shortName: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  speechSynthesisVoice?: SpeechSynthesisVoice;
}

/**
 * Resolve Edge Neural voice with AI Brain language detection
 */
export function resolveEdgeVoice(
  detectedLang: 'sw' | 'en',
  mode: VoiceMode,
  availableVoices: SpeechSynthesisVoice[]
): ResolvedVoiceInfo {
  let targetKey: 'zuri' | 'asilia' = 'asilia';

  if (mode === 'zuri') {
    targetKey = 'zuri';
  } else if (mode === 'asilia') {
    targetKey = 'asilia';
  } else if (mode === 'auto') {
    // Brain-detected language: 'sw' -> sw-KE-ZuriNeural, 'en' -> en-KE-AsiliaNeural
    targetKey = detectedLang === 'sw' ? 'zuri' : 'asilia';
  } else {
    // Custom device voice selected by name
    const custom = availableVoices.find((v) => v.name === mode);
    if (custom) {
      return {
        voiceKey: detectedLang === 'sw' ? 'zuri' : 'asilia',
        edgeVoiceId: custom.name,
        name: custom.name,
        shortName: custom.name,
        lang: custom.lang,
        rate: 0.88,
        pitch: 1.15,
        volume: 1.0,
        speechSynthesisVoice: custom
      };
    }
    targetKey = detectedLang === 'sw' ? 'zuri' : 'asilia';
  }

  const edgeConfig = EDGE_VOICES[targetKey];
  let matchedVoice: SpeechSynthesisVoice | undefined;

  if (targetKey === 'zuri') {
    // 1. Direct match for Zuri or sw-KE-ZuriNeural
    matchedVoice =
      availableVoices.find(
        (v) =>
          v.name.includes('sw-KE-ZuriNeural') ||
          v.name.toLowerCase().includes('zuri') ||
          v.voiceURI.includes('sw-KE-ZuriNeural') ||
          v.voiceURI.toLowerCase().includes('zuri')
      ) ||
      // 2. Swahili female voice (sw or sw-KE)
      availableVoices.find(
        (v) =>
          (v.lang.toLowerCase().includes('sw') || v.lang.toLowerCase() === 'sw-ke') &&
          !/male|david|george|stefan|james|richard|martin/i.test(v.name)
      ) ||
      // 3. Any Swahili voice
      availableVoices.find((v) => v.lang.toLowerCase().includes('sw')) ||
      // 4. Kenyan voice (en-ke or sw-ke)
      availableVoices.find(
        (v) =>
          (v.lang.toLowerCase().includes('en-ke') || v.name.toLowerCase().includes('kenya')) &&
          !/male|david|george|mark|richard|stefan|james/i.test(v.name)
      ) ||
      // 5. Warm non-male voice
      availableVoices.find((v) => !/male|david|george|mark|richard|stefan|james/i.test(v.name));
  } else {
    // 1. Direct match for Asilia or en-KE-AsiliaNeural
    matchedVoice =
      availableVoices.find(
        (v) =>
          v.name.includes('en-KE-AsiliaNeural') ||
          v.name.toLowerCase().includes('asilia') ||
          v.voiceURI.includes('en-KE-AsiliaNeural') ||
          v.voiceURI.toLowerCase().includes('asilia')
      ) ||
      // 2. Kenyan English female
      availableVoices.find(
        (v) =>
          (v.lang.toLowerCase().includes('en-ke') || v.name.toLowerCase().includes('kenya')) &&
          !/male|david|george|mark|richard|stefan|james/i.test(v.name)
      ) ||
      // 3. Warm non-male voice
      availableVoices.find((v) => !/male|david|george|mark|richard|stefan|james/i.test(v.name));
  }

  return {
    voiceKey: targetKey,
    edgeVoiceId: edgeConfig.id,
    name: edgeConfig.name,
    shortName: edgeConfig.shortName,
    lang: edgeConfig.lang,
    rate: edgeConfig.rate,
    pitch: edgeConfig.pitch,
    volume: edgeConfig.volume,
    speechSynthesisVoice: matchedVoice
  };
}
let asiliaVoice: SpeechSynthesisVoice | null = null;
let zuriVoice: SpeechSynthesisVoice | null = null;
export function loadVoices() {
  try {
    const vs = window.speechSynthesis?.getVoices() || [];
    asiliaVoice = getAsiliaVoice(vs) || null;
    zuriVoice = getZuriVoice(vs) || null;
  } catch {}
}
export function getAsiliaVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return voices.find((v) => v.name.includes("Samantha") || v.name.includes("Google UK English Female"))
    || voices.find((v) => v.lang === "en-KE" && !/male/i.test(v.name))
    || voices.find((v) => v.lang === "en-GB" && !/male/i.test(v.name))
    || voices.find((v) => v.lang.startsWith("en") && !/male/i.test(v.name));
}
export function getZuriVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return voices.find((v) => v.lang === "sw-KE" || v.lang.startsWith("sw") || v.name.includes("Swahili"))
    || voices.find((v) => v.lang === "en-KE" && !/male/i.test(v.name));
}
export function speakAsilia(text: string) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const vs = window.speechSynthesis.getVoices();
    const v = asiliaVoice || getAsiliaVoice(vs);
    if (v) { u.voice = v; u.lang = v.lang || "en-KE"; } else u.lang = "en-KE";
    u.pitch = 1.15; u.rate = 0.92; u.volume = 1.0;
    window.speechSynthesis.speak(u);
  } catch {}
}
export function speakZuri(text: string) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const vs = window.speechSynthesis.getVoices();
    const v = zuriVoice || getZuriVoice(vs);
    if (v) { u.voice = v; u.lang = v.lang || "sw-KE"; } else u.lang = "sw-KE";
    u.pitch = 1.1; u.rate = 0.9; u.volume = 1.0;
    window.speechSynthesis.speak(u);
  } catch {}
}
export function autoDetectLanguageAndSpeak(text: string) {
  if (/habari|mambo|poa|sawa|asante|karibu|nzuri|shikamoo|vipi|nani|wewe|mimi/i.test(text)) speakZuri(text);
  else speakAsilia(text);
}
export function speak(text: string) { autoDetectLanguageAndSpeak(text); }
export function listen(onResult: (t: string) => void) {
  try {
    const W = window as any;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = "en-KE"; r.interimResults = false; r.continuous = false;
    r.onresult = (e: any) => onResult(e.results[0][0].transcript);
    r.start();
    return r;
  } catch { return null; }
}
/** KEEP typing capability anywhere */
export async function reactorType(text: string): Promise<boolean> {
  try {
    const n = (window as any).AndroidInterface;
    if (n?.globalType) return n.globalType(text);
    const a = document.activeElement as any;
    if (a && "value" in a) { a.value = text; a.dispatchEvent(new Event("input", { bubbles: true })); return true; }
    const inp = document.querySelector("input,textarea") as any;
    if (inp) { inp.focus(); inp.value = text; inp.dispatchEvent(new Event("input", { bubbles: true })); return true; }
  } catch {}
  return false;
}
if (typeof window !== "undefined") {
  try {
    window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);
    setTimeout(loadVoices, 800);
  } catch {}
}

