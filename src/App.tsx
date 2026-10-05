import React, { useState, useRef, useEffect } from 'react';
import { EDGE_VOICES, resolveEdgeVoice, detectLanguageSmart, isSwahiliOrSheng, VoiceMode } from './services/voiceService';

type Tab = 'chat' | 'eyes' | 'alarm' | 'tasks';

interface Msg {
  id: string;
  from: 'akili' | 'user';
  text: string;
  time: string;
  source?: string;
  lang?: 'sw' | 'en';
}

interface TaskItem {
  id: string;
  title: string;
  done: boolean;
}

export interface AlarmItem {
  id: string;
  time: string; // e.g. "06:00"
  label: string;
  enabled: boolean;
}

const BUILDER_INFO = {
  name: "Prof Mark",
  title: "Builder & Architect of Akili V8 & MK-IV Reactor",
  background: "Kenyan innovator, builder of Akili V8, MK-IV reactor core, fluent in Sheng, Swahili, and English",
  hardware: "Samsung Galaxy A07 (6.7\" 90Hz, 5000mAh) + HP EliteBook field tethering",
  reactor: "MK-IV Singularity Reactor (Black Glass, Gold/Pink Dual Rings, Conic Nebula Spiral)"
};

// Smart task title cleaner: Strips conversational filler and extracts true intent
export const cleanTaskTitle = (raw: string): string => {
  let t = raw
    .replace(/^(akili|hey akili|tafadhali|please|nisaidie|remind me to|remember to)\s*/i, '')
    .replace(/\s*(put that in task|add to task|weka kwa task|weka task|tengeneza task|add task|put in task|kwa task)\s*\.?$/i, '')
    .replace(/^\s*(task|kazi|remind me to|remember to)\s*:?\s*/i, '')
    .trim();

  if (!t) t = raw.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// Check if string is predominantly Swahili or Sheng (matches PC autodetector)
export const isSwahiliText = isSwahiliOrSheng;

// Fuzzy detector for creator questions even with phonetic misrecognitions
export const isCreatorQuestion = (text: string): boolean => {
  const low = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  return (
    low.includes('who am i') ||
    low.includes('huwa mae mbe') || // Phone misrecognition for "Who am I"
    low.includes('huwa me') ||
    low.includes('huwa mae') ||
    low.includes('mimi ni nani') ||
    low.includes('mimi nani') ||
    low.includes('unanijua') ||
    low.includes('do you know me') ||
    low.includes('who am')
  );
};

export default function App() {
  const [tab, setTab] = useState<Tab>('chat');
  const [hist, setHist] = useState<Tab[]>(['chat']);
  const [enlarged, setEnlarged] = useState(false);
  const [showType, setShowType] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [charging, setCharging] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [brainSource, setBrainSource] = useState<string>('GROQ 120B / GEMINI 3.5');
  const [micLang, setMicLang] = useState<'en-KE' | 'sw-KE'>('en-KE'); // default en-KE so 'Who am I' doesn't become 'huwa mae mbe'
  const [lastTranscript, setLastTranscript] = useState<string>('');

  // Multi-Alarm System (User requested: "Alarm only 1 time edit - need many")
  const [alarms, setAlarms] = useState<AlarmItem[]>(() => {
    try {
      const saved = localStorage.getItem('akili_multi_alarms');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { id: '1', time: '06:00', label: '06:00 Nairobi Morning Awakening', enabled: true },
      { id: '2', time: '06:14', label: '06:14 Circadian Solar Sync', enabled: true },
      { id: '3', time: '12:48', label: '12:48 Solar Noon Calibration', enabled: true },
      { id: '4', time: '19:42', label: '19:42 Twilight Perimeter Scan', enabled: false },
      { id: '5', time: '22:00', label: '22:00 Stasis Recharge', enabled: false }
    ];
  });

  const [newAlarmTime, setNewAlarmTime] = useState('07:00');
  const [newAlarmLabel, setNewAlarmLabel] = useState('Morning Briefing');
  const [showAddAlarm, setShowAddAlarm] = useState(false);

  const [eyesOn, setEyesOn] = useState(() => localStorage.getItem('akili_eyes') === 'true');

  const [newTask, setNewTask] = useState('');
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem('akili_tasks') ||
          '[{"id":"1","title":"Akili V8 MK-IV Field Testing & A07 Performance Validation","done":false},{"id":"2","title":"Galaxy A07 & HP EliteBook High-Speed Ad-Hoc Hotspot Sync","done":false}]'
      );
    } catch {
      return [
        { id: '1', title: 'Akili V8 MK-IV Field Testing & A07 Performance Validation', done: false },
        { id: '2', title: 'Galaxy A07 & HP EliteBook High-Speed Ad-Hoc Hotspot Sync', done: false }
      ];
    }
  });

  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('akili_msgs') || '[]');
    } catch {
      return [];
    }
  });

  const listRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const starsRef = useRef<HTMLCanvasElement>(null);
  const recogRef = useRef<any>(null);
  const bargeRef = useRef<any>(null);
  const lastTapRef = useRef<number>(0);
  const isSpeakingRef = useRef<boolean>(false);
  const micStreamRef = useRef<MediaStream | null>(null);

  // 1. DUAL NEURAL VOICE ENGINE: ZURI (Swahili/Sheng Expert) + ASILIA (English Kenyan Warm)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceMode, setSelectedVoiceMode] = useState<string>(() => {
    return localStorage.getItem('akili_voice_mode') || 'auto';
  });

  useEffect(() => {
    const updateVoices = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const vList = window.speechSynthesis.getVoices();
        if (vList.length > 0) {
          setAvailableVoices(vList);
        }
      }
    };
    updateVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
      const poll = setInterval(updateVoices, 1000);
      return () => {
        clearInterval(poll);
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }, []);

  // Akili Speech Synthesizer with AI Brain Language Detection
  // Auto-detects ANY Swahili or Sheng word using Groq / Gemini brain
  // Keeps rate 0.88, pitch 1.15, volume 1.0 for warm human delivery
  const speakAkili = async (text: string, forceLang?: 'sw' | 'en') => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    try {
      bargeRef.current?.stop();
    } catch {}

    const detectedLang = forceLang || await detectLanguageSmart(text);
    const resolved = resolveEdgeVoice(detectedLang, selectedVoiceMode, availableVoices);
    const u = new SpeechSynthesisUtterance(text);
    if (resolved.speechSynthesisVoice) {
      u.voice = resolved.speechSynthesisVoice;
      u.lang = resolved.speechSynthesisVoice.lang || resolved.lang;
    } else {
      u.lang = resolved.lang;
    }

    u.rate = resolved.rate;
    u.pitch = resolved.pitch;
    u.volume = resolved.volume;

    u.onstart = () => {
      isSpeakingRef.current = true;
      startBargeListening();
    };

    u.onend = () => {
      isSpeakingRef.current = false;
      try {
        bargeRef.current?.stop();
      } catch {}
    };

    u.onerror = () => {
      isSpeakingRef.current = false;
      try {
        bargeRef.current?.stop();
      } catch {}
    };

    window.speechSynthesis.speak(u);
    startBargeListening();
  };

  // Alias for backward compatibility
  const speakAsilia = speakAkili;

  // Immediate Tulia Stop (silences speech and mic immediately)
  const stopAllSpeech = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    try {
      bargeRef.current?.stop();
    } catch {}
    try {
      recogRef.current?.stop();
    } catch {}
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    setMicOn(false);
    setEnlarged(false);
    setShowType(false);
    if ('vibrate' in navigator) navigator.vibrate([60, 40, 60]);
  };

  // Active barge-in listener while Akili speaks
  const startBargeListening = () => {
    const win = window as any;
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) return;
    try {
      bargeRef.current?.stop();
    } catch {}

    try {
      const rec = new SR();
      rec.lang = micLang;
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (e: any) => {
        const transcript = e.results[e.results.length - 1][0].transcript.toLowerCase();
        if (
          transcript.includes('tulia') ||
          transcript.includes('kimya') ||
          transcript.includes('stop') ||
          transcript.includes('nyamaza') ||
          transcript.includes('shh') ||
          transcript.includes('quiet')
        ) {
          stopAllSpeech();
        }
      };

      rec.onerror = () => {};
      rec.onend = () => {
        if (isSpeakingRef.current) {
          try {
            rec.start();
          } catch {}
        }
      };

      rec.start();
      bargeRef.current = rec;
    } catch {}
  };

  // Celestial Starfield Animation
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: '1',
          from: 'akili',
          text: `Habari Prof Mark! Mimi ni Akili Lite V6. Real Groq (120B) na Gemini (3.5 Flash) zimeunganishwa. Asilia natural voice iko tayari. Long-press reactor (700ms) kuongea, au chagua [🇰🇪 ${micLang}]. Sema TULIA wakati wowote kusimamisha sauti!`,
          time: new Date().toLocaleTimeString(),
          source: 'GROQ 120B'
        }
      ]);
    }

    const c = starsRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();

    const stars = Array.from({ length: 140 }, () => ({
      x: Math.random() * c.width,
      y: Math.random() * c.height,
      r: Math.random() * 1.3 + 0.3,
      t: Math.random() * 6,
      s: 0.02 + Math.random() * 0.04
    }));

    let raf: number;
    const loop = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      stars.forEach((s) => {
        s.t += s.s;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.28);
        ctx.fillStyle = `rgba(255,${Math.floor(200 + Math.sin(s.t) * 35 + 20)},${Math.floor(180 + Math.cos(s.t) * 45 + 30)},${0.4 + Math.sin(s.t) * 0.6})`;
        if (s.r > 1) {
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#ffd700';
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      raf = requestAnimationFrame(loop);
    };
    loop();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Save states
  useEffect(() => {
    localStorage.setItem('akili_msgs', JSON.stringify(messages));
    setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, 80);
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('akili_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('akili_multi_alarms', JSON.stringify(alarms));
  }, [alarms]);

  useEffect(() => {
    localStorage.setItem('akili_eyes', String(eyesOn));
  }, [eyesOn]);

  useEffect(() => {
    if (selectedVoiceMode) {
      localStorage.setItem('akili_voice_mode', selectedVoiceMode);
    }
  }, [selectedVoiceMode]);

  // Touch scroll fix for mobile viewports
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const handleTouch = (e: TouchEvent) => {
      e.stopPropagation();
    };
    el.addEventListener('touchmove', handleTouch, { passive: true });
    return () => el.removeEventListener('touchmove', handleTouch);
  }, []);

  // 2. REAL BRAIN QUERY WIRING (Groq 120B -> Gemini 3.5 Flash -> Grounded Fallback)
  const askBrain = async (q: string): Promise<{ text: string; source: string; lang?: 'sw' | 'en' }> => {
    // Check specific "Who am I? / Mimi ni nani? / huwa mae mbe" queries
    if (isCreatorQuestion(q)) {
      if (isSwahiliText(q)) {
        return {
          text: `Wewe ni Prof Mark, mvumbuzi na mjenzi mkuu wa Akili V8 na MK-IV Singularity Reactor! Mkenya mwerevu, mtaalamu wa mifumo ya kisasa, na mfasaha wa Sheng na Kiswahili. Mimi ni Akili, mwandamizi wako mwaminifu.`,
          source: 'CREATOR PROTOCOL',
          lang: 'sw'
        };
      } else {
        return {
          text: `You are Prof Mark, the brilliant Kenyan builder and systems architect of Akili V8 and the MK-IV Reactor core! Fluent in Sheng, Swahili, and cloud telemetry. I am Akili Lite, your dedicated AI companion.`,
          source: 'CREATOR PROTOCOL',
          lang: 'en'
        };
      }
    }

    const lower = q.toLowerCase();
    if (lower.includes('who are you') || lower.includes('nani wewe') || lower.includes('what is akili')) {
      if (isSwahiliText(q)) {
        return {
          text: `Mimi ni Akili Lite V6, akili mnemba ya kibinafsi iliyoundwa na Prof Mark. Ninaendeshwa na MK-IV Reactor yenye dual gold-pink rings, nikifanya kazi kwenye Samsung Galaxy A07 na HP EliteBook.`,
          source: 'SYSTEM PROFILE',
          lang: 'sw'
        };
      } else {
        return {
          text: `I am Akili Lite V6, an advanced personal AI built by Prof Mark. Powered by the MK-IV Reactor core with dual gold-pink rings, designed for Galaxy A07 and HP EliteBook tethering.`,
          source: 'SYSTEM PROFILE',
          lang: 'en'
        };
      }
    }

    // 1. Try server endpoint /api/chat (Groq 120B or Gemini 3.5 Flash from Secrets)
    try {
      const apiRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: q,
          history: messages.slice(-4).map((m) => ({
            role: m.from === 'akili' ? 'assistant' : 'user',
            content: m.text
          }))
        })
      });

      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data.text && data.text.trim()) {
          const src = data.source?.includes('groq') ? 'GROQ 120B' : (data.source?.includes('gemini') ? 'GEMINI 3.5' : 'AKILI CORE');
          setBrainSource(src);
          return { text: data.text.trim(), source: src, lang: data.lang };
        }
      }
    } catch {}

    // 2. DuckDuckGo gpt-4o-mini client fallback
    if (navigator.onLine) {
      try {
        const ddgRes = await fetch('https://duckduckgo.com/duckchat/v1/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-vqd-4': '1'
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are Akili Lite V6, personal AI companion to Prof Mark (Kenyan creator of Akili V8 & MK-IV Reactor). Hardware: Samsung Galaxy A07 & HP EliteBook. You speak Asilia warm Kenyan female tone. Answer in the same language the user asked (English if asked in English, Sheng/Swahili if asked in Swahili/Sheng). Never repeat the question verbatim. Keep responses under 3 sentences.`
              },
              { role: 'user', content: q }
            ]
          })
        });

        const txt = await ddgRes.text();
        const lines = txt.split('\n').filter((l) => l.startsWith('data:'));
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const j = JSON.parse(lines[i].replace(/^data:\s*/, '').trim());
            const c = j.message || j.data?.message;
            if (c && c.trim().length > 6) {
              setBrainSource('DUCKCHAT');
              return { text: c.trim(), source: 'DUCKCHAT' };
            }
          } catch {}
        }
      } catch {}
    }

    // 3. Smart Local Grounded Fallback
    setBrainSource('LOCAL CORE');
    if (isSwahiliText(q)) {
      return {
        text: `Nimekuelewa vizuri, Prof Mark! Kuhusu "${q}", mifumo ya Akili V8 na MK-IV Reactor kwenye Galaxy A07 iko tayari kwa kazi.`,
        source: 'LOCAL CORE',
        lang: 'sw'
      };
    } else {
      return {
        text: `Understood loud and clear, Prof Mark! Regarding "${q}", Akili V8 neural core on your Galaxy A07 is fully synchronized and primed.`,
        source: 'LOCAL CORE',
        lang: 'en'
      };
    }
  };

  const send = async (txt?: string) => {
    const t = (txt || input).trim();
    if (!t) return;
    setMessages((m) => [
      ...m,
      { id: Date.now().toString(), from: 'user', text: t, time: new Date().toLocaleTimeString() }
    ]);
    setInput('');
    setShowType(false);
    setEnlarged(false);
    setIsThinking(true);

    const reply = await askBrain(t);
    setIsThinking(false);
    const resolvedLang = reply.lang || await detectLanguageSmart(reply.text);

    setMessages((m) => [
      ...m,
      {
        id: (Date.now() + 1).toString(),
        from: 'akili',
        text: reply.text,
        time: new Date().toLocaleTimeString(),
        source: reply.source,
        lang: resolvedLang
      }
    ]);
    speakAkili(reply.text, resolvedLang);
  };

  // 3. SMART TASK COMMAND HANDLER
  const handleTaskCommand = async (rawText: string) => {
    const clean = cleanTaskTitle(rawText);
    if (!clean) return;
    setTasks((prev) => [{ id: Date.now().toString(), title: clean, done: false }, ...prev]);
    setTab('tasks');
    const lang = await detectLanguageSmart(rawText);
    const reply = lang === 'sw' ? `Sawa Prof Mark, nimeweka task: "${clean}".` : `Got it Prof Mark, task added: "${clean}".`;
    speakAkili(reply, lang);
  };

  // 4. MICROPHONE HEARING FIX & ECHO PREVENTION
  // - Hardware audio constraints with echoCancellation, noiseSuppression, autoGainControl
  // - speechSynthesis.cancel() stops Akili before mic starts so mic does not hear itself
  // - interimResults = false, continuous = false to prevent hallucinated repetitions
  const startPushToTalk = async () => {
    const win = window as any;
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) {
      alert('Speech recognition is not supported on this browser.');
      return;
    }

    // 1. CRITICAL: Stop Akili speaking immediately so mic never hears itself!
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    try {
      bargeRef.current?.stop();
    } catch {}

    // 2. Request getUserMedia with hardware echo cancellation and noise suppression
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        micStreamRef.current = stream;
      }
    } catch (e) {
      console.warn('getUserMedia audio constraint notice:', e);
    }

    try {
      const rec = new SR();
      rec.lang = micLang; // uses selected language (en-KE or sw-KE)
      rec.continuous = false; // single clear utterance to avoid loops
      rec.interimResults = false; // final results only to prevent hallucination

      rec.onstart = () => {
        setMicOn(true);
        if ('vibrate' in navigator) navigator.vibrate([80, 40, 80]);
      };

      rec.onresult = (e: any) => {
        const transcript = e.results?.[0]?.[0]?.transcript?.trim() || '';
        if (transcript) {
          setLastTranscript(transcript);
          setInput(transcript);

          // Check if user said Tulia
          const low = transcript.toLowerCase();
          if (low.includes('tulia') || low.includes('kimya') || low.includes('stop')) {
            stopAllSpeech();
            return;
          }

          // Check if user said Task command
          if (
            low.includes('task') ||
            low.includes('tengeneza') ||
            low.includes('birthday') ||
            low.includes('kesho') ||
            low.includes('tomorrow') ||
            low.includes('remind')
          ) {
            handleTaskCommand(transcript);
            return;
          }

          // Automatically send query
          send(transcript);
        }
      };

      rec.onerror = (err: any) => {
        console.warn('Speech recognition error:', err);
        setMicOn(false);
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach((t) => t.stop());
          micStreamRef.current = null;
        }
      };

      rec.onend = () => {
        setMicOn(false);
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach((t) => t.stop());
          micStreamRef.current = null;
        }
      };

      recogRef.current = rec;
      rec.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      setMicOn(false);
    }
  };

  const stopPushToTalk = () => {
    setMicOn(false);
    if ('vibrate' in navigator) navigator.vibrate(40);
    try {
      recogRef.current?.stop();
    } catch {}
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  };

  const toggleMicPushToTalk = () => {
    if (!micOn) {
      startPushToTalk();
    } else {
      stopPushToTalk();
    }
  };

  // Navigation with history stack
  const changeTab = (t: Tab) => {
    if (t !== tab) {
      setHist((h) => [...h, tab].slice(-10));
      setTab(t);
    }
  };

  const goBack = () => {
    const prev = hist[hist.length - 1] || 'chat';
    setHist((h) => (h.length > 1 ? h.slice(0, -1) : ['chat']));
    setTab(prev);
  };

  // 5. MULTI-ALARM BACKGROUND CHECKER (Checks Africa/Nairobi against ALL active alarms)
  useEffect(() => {
    const check = setInterval(() => {
      const now = new Date().toLocaleString('en-KE', {
        timeZone: 'Africa/Nairobi',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });

      // Find any enabled alarm that matches the current minute
      const triggered = alarms.find((a) => a.enabled && a.time === now);
      if (triggered) {
        // Celestial audio chime
        try {
          const win = window as any;
          const AudioCtx = win.AudioContext || win.webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.setValueAtTime(528, ctx.currentTime);
            gain.gain.setValueAtTime(0.4, ctx.currentTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.6);
          }
        } catch {}

        speakAsilia(
          `Good morning Boss Prof Mark! It is ${triggered.time} EAT Nairobi. Alarm alert: ${triggered.label}. All systems on your Galaxy A07 are locked and primed.`
        );
        if ('vibrate' in navigator) navigator.vibrate([600, 200, 600, 200, 800]);
      }
    }, 15000);

    return () => clearInterval(check);
  }, [alarms]);

  // Eyes toggle
  const toggleEyes = async () => {
    const nextState = !eyesOn;
    setEyesOn(nextState);
    localStorage.setItem('akili_eyes', String(nextState));

    if (nextState && videoRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        videoRef.current.srcObject = stream;
      } catch {
        try {
          const stream2 = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) videoRef.current.srcObject = stream2;
        } catch {}
      }
    } else {
      const s = videoRef.current?.srcObject as MediaStream;
      s?.getTracks().forEach((t) => t.stop());
    }
  };

  // Reactor gesture handlers
  const onPointerDownOrb = (e: React.PointerEvent) => {
    const sx = e.clientX - pos.x;
    const sy = e.clientY - pos.y;
    let moved = 0;
    setCharging(true);

    timerRef.current = setTimeout(() => {
      setCharging(false);
      toggleMicPushToTalk();
    }, 700);

    const move = (ev: PointerEvent) => {
      moved = Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY);
      if (moved > 10) {
        if (timerRef.current) clearTimeout(timerRef.current);
        setCharging(false);
      }
      setPos({ x: ev.clientX - sx, y: ev.clientY - sy });
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (timerRef.current) clearTimeout(timerRef.current);
      setCharging(false);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onDoubleTapOrb = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      setEnlarged(true);
      setShowType(true);
      if ('vibrate' in navigator) navigator.vibrate(50);
    }
    lastTapRef.current = now;
  };

  // Add new alarm helper
  const addAlarm = () => {
    if (!newAlarmTime) return;
    const newA: AlarmItem = {
      id: Date.now().toString(),
      time: newAlarmTime,
      label: newAlarmLabel.trim() || `${newAlarmTime} Nairobi Alarm`,
      enabled: true
    };
    setAlarms((prev) => [...prev, newA]);
    setShowAddAlarm(false);
    setNewAlarmLabel('');
    speakAsilia(`Alarm added for ${newAlarmTime} EAT.`);
  };

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden flex flex-col font-['Rajdhani'] antialiased select-none">
      {/* Cosmic background with perpetual twinkling stars */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,#1a0b3a_0%,#0e0728_25%,#050312_60%,#020106_85%)]" />
      <div className="absolute w-[450px] h-[450px] -top-28 -left-20 bg-[radial-gradient(circle,#ff149335_0%,#7b2cbf25_35%,transparent_70%)] blur-[40px] pointer-events-none" />
      <div className="absolute w-[380px] h-[380px] top-[40%] -right-20 bg-[radial-gradient(circle,#ffd70018_0%,#ff2a8518_40%,transparent_70%)] blur-[50px] pointer-events-none" />
      <canvas ref={starsRef} className="absolute inset-0 pointer-events-none" />

      {/* Enlarged Backdrop Blur Scrim */}
      {enlarged && (
        <div
          className="absolute inset-0 z-[80] bg-black/65 backdrop-blur-sm"
          onClick={() => {
            setEnlarged(false);
            setShowType(false);
            stopAllSpeech();
          }}
        />
      )}

      {/* HEADER */}
      <header className="relative z-20 flex justify-between items-center px-3 pt-3 pb-2 bg-black/40 backdrop-blur shrink-0 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-300 to-pink-500 p-[1.5px] shadow-[0_0_10px_#ffd70066]">
            <div className="w-full h-full rounded-full bg-black grid place-items-center text-amber-300 text-xs font-black">
              ✦
            </div>
          </div>
          <div>
            <div className="font-['Orbitron'] text-[10px] font-black text-amber-200">
              AKILI LITE V6 • GALAXY A07
            </div>
            <div className="text-[7.5px] text-white/60 truncate max-w-[190px]">
              {BUILDER_INFO.name} • {BUILDER_INFO.title}
            </div>
          </div>
        </div>

        {/* BACK BUTTON & REAL BRAIN STATUS */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={goBack}
            className="text-[9px] font-['Orbitron'] font-black px-2.5 py-1 rounded-full bg-white text-black hover:bg-amber-300 active:scale-95 transition shadow-sm cursor-pointer"
          >
            ← Back
          </button>
          <div className="text-[7px] font-mono text-emerald-400 px-2 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40">
            {brainSource}
          </div>
        </div>
      </header>

      {/* HORIZONTAL TAB NAVIGATION */}
      <nav className="relative z-20 flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none shrink-0 border-b border-white/5">
        {[
          { id: 'chat', label: 'Chat' },
          { id: 'eyes', label: `Eyes ${eyesOn ? 'ON' : 'OFF'}` },
          { id: 'alarm', label: `Alarms (${alarms.filter((a) => a.enabled).length})` },
          { id: 'tasks', label: `Tasks (${tasks.filter((x) => !x.done).length})` }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id as Tab)}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-[10px] font-black font-['Orbitron'] cursor-pointer transition-all active:scale-95 ${
              tab === t.id
                ? 'bg-amber-400 text-black shadow-[0_0_10px_#ffd700]'
                : 'bg-white/10 text-white/75 border border-white/10 hover:bg-white/20'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* MAIN CONTENT AREA */}
      <main
        ref={mainRef}
        className="relative z-20 flex-1 overflow-hidden flex flex-col px-3 pb-[130px]"
      >
        {/* TAB 1: CHAT */}
        {tab === 'chat' && (
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto space-y-2.5 pr-1 touch-pan-y scrollbar-none"
            style={{ overscrollBehavior: 'contain' }}
          >
            {/* White Telemetry Card */}
            <div className="bg-white rounded-[18px] p-3 text-neutral-900 shadow-lg border-l-4 border-l-[#ff2a85]">
              <div className="flex justify-between items-center pb-1.5 border-b border-neutral-100">
                <span className="font-['Orbitron'] font-black text-[10px] text-[#9c6500]">
                  NEURAL CORE ONLINE // QUANTUM EYE: {eyesOn ? 'TRACKING' : 'STANDBY'}
                </span>
                <span className="text-[8px] font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                  9.84 THz LOCKED
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-200">
                  <div className="text-[7.5px] font-mono text-neutral-500">VOICE ENGINE</div>
                  <div className="font-bold text-[10px] text-pink-600 truncate">Zuri &amp; Asilia Dual</div>
                </div>
                <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-200">
                  <div className="text-[7.5px] font-mono text-neutral-500">SYNC CYCLE</div>
                  <div className="font-bold text-[10px] text-amber-600">06:14 EAT</div>
                </div>
                <div className="bg-neutral-50 p-1.5 rounded-lg border border-neutral-200">
                  <div className="text-[7.5px] font-mono text-neutral-500">MIC FILTER</div>
                  <div className="font-bold text-[10px] text-emerald-600 truncate">DSP Echo Cancel</div>
                </div>
              </div>
            </div>

            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-[16px] px-3.5 py-2.5 text-[13px] leading-[1.35] transition-all ${
                  m.from === 'akili'
                    ? 'bg-white text-black shadow-md border-l-[3.5px] border-l-[#ff2a85]'
                    : 'bg-gradient-to-br from-[#ffd700] to-[#ffb338] text-black ml-6 shadow-[0_4px_14px_rgba(255,215,0,0.3)]'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-['Orbitron'] text-[8px] font-black opacity-75">
                    {m.from === 'akili'
                      ? (m.lang === 'sw' || isSwahiliText(m.text)
                          ? 'AKILI LITE • Zuri (sw-KE-ZuriNeural)'
                          : 'AKILI LITE • Asilia (en-KE-AsiliaNeural)')
                      : 'PROF. MARK'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {m.source && (
                      <span className="text-[7px] font-mono bg-black/10 px-1.5 py-0.5 rounded">
                        {m.source}
                      </span>
                    )}
                    <span className="text-[7.5px] font-mono opacity-50">{m.time}</span>
                  </div>
                </div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            ))}

            {isThinking && (
              <div className="bg-white/95 text-black rounded-[15px] px-3.5 py-2 text-[12px] font-mono animate-pulse w-fit border-l-[3.5px] border-l-[#ffd700] shadow-md">
                Akili thinking with {brainSource}...
              </div>
            )}
            <div className="h-4" />
          </div>
        )}

        {/* TAB 2: EYES TOGGLE */}
        {tab === 'eyes' && (
          <div className="bg-white rounded-[20px] p-3.5 flex-1 overflow-y-auto text-neutral-900 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center pb-2 border-b border-neutral-100">
                <div>
                  <div className="font-['Orbitron'] font-black text-[12px] text-[#9c6500]">
                    Akili Eyes Sensor • Galaxy A07
                  </div>
                  <div className="text-[8px] font-mono text-neutral-500">Real A07 back camera telemetry</div>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[9px] font-['Orbitron'] font-black ${
                    eyesOn ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'
                  }`}
                >
                  {eyesOn ? 'LIVE CAM' : 'STANDBY'}
                </span>
              </div>

              <div className="mt-2.5 h-[220px] bg-black rounded-xl overflow-hidden relative flex items-center justify-center border border-amber-400/40">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                {!eyesOn && (
                  <div className="absolute inset-0 grid place-items-center text-white/50 text-[11px] font-mono">
                    Camera OFF • Tap START EYES below
                  </div>
                )}
                {eyesOn && (
                  <div className="absolute inset-0 grid place-items-center pointer-events-none">
                    <div className="w-24 h-24 border-2 border-dashed border-amber-400 rounded-full animate-spin [animation-duration:15s]" />
                    <div className="absolute w-12 h-12 border border-pink-500 rounded-full" />
                    <div className="absolute w-2 h-2 bg-amber-300 rounded-full animate-ping" />
                  </div>
                )}
                <div className="absolute bottom-1.5 left-1.5 text-[7px] text-white bg-black/70 px-1.5 py-0.5 rounded font-mono">
                  Galaxy A07 Environment Lens
                </div>
              </div>
            </div>

            <div className="space-y-2 mt-2">
              <button
                onClick={toggleEyes}
                className={`w-full py-3 rounded-xl font-['Orbitron'] font-black text-[11px] shadow-md transition active:scale-98 cursor-pointer ${
                  eyesOn ? 'bg-red-500 text-white' : 'bg-gradient-to-r from-amber-400 to-pink-500 text-black'
                }`}
              >
                {eyesOn ? 'STOP EYES' : 'START EYES'}
              </button>
              <div className="text-[9px] bg-amber-50 p-2.5 rounded-xl border border-amber-200 leading-snug text-neutral-800 font-medium">
                <strong>Screen Eye Accessibility:</strong> Monday APK media projection ready — allows Akili to view surveys, games, and forms on your Galaxy A07 screen.
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MULTI-ALARM MANAGER (FIX: "Alarm only 1 time edit - need many") */}
        {tab === 'alarm' && (
          <div className="bg-white rounded-[20px] p-3.5 text-neutral-900 shadow-xl space-y-3 overflow-y-auto flex-1 touch-pan-y scrollbar-none">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <div className="font-['Orbitron'] font-black text-[12px] text-[#9c6500]">
                  CIRCADIAN SOLAR ALARMS (EAT NAIROBI)
                </div>
                <div className="text-[8.5px] font-mono text-neutral-500">
                  Multiple alarms with Asilia natural voice briefing
                </div>
              </div>
              <button
                onClick={() => setShowAddAlarm(!showAddAlarm)}
                className="px-3 py-1 bg-amber-400 font-['Orbitron'] font-black text-[9px] rounded-full text-black cursor-pointer active:scale-95 shadow-sm"
              >
                {showAddAlarm ? '✕ CANCEL' : '+ ADD ALARM'}
              </button>
            </div>

            {/* Current Nairobi Time Card */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                <div className="text-[8px] font-mono text-neutral-500">NOW EAT (NAIROBI)</div>
                <div className="font-['Orbitron'] font-bold text-[15px] text-neutral-900 mt-0.5">
                  {new Date().toLocaleString('en-KE', {
                    timeZone: 'Africa/Nairobi',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
              <div className="bg-pink-50 p-2.5 rounded-xl border border-pink-200">
                <div className="text-[8px] font-mono text-neutral-500">VOICE ENGINE</div>
                <div className="font-bold text-[11px] text-pink-700 mt-0.5 truncate">
                  Zuri (Sheng) &amp; Asilia (EN)
                </div>
              </div>
            </div>

            {/* Add New Alarm Inline Form */}
            {showAddAlarm && (
              <div className="p-3 bg-neutral-100 rounded-xl space-y-2 border border-amber-300">
                <div className="font-['Orbitron'] font-bold text-[10px] text-amber-900">
                  NEW ALARM SCHEDULE
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="time"
                    value={newAlarmTime}
                    onChange={(e) => setNewAlarmTime(e.target.value)}
                    className="font-['Orbitron'] font-bold text-lg bg-white px-3 py-1.5 rounded-lg border border-neutral-300 outline-none"
                  />
                  <input
                    value={newAlarmLabel}
                    onChange={(e) => setNewAlarmLabel(e.target.value)}
                    placeholder="Alarm label (e.g. Standup call)..."
                    className="flex-1 bg-white px-3 py-2 rounded-lg text-[12px] border border-neutral-300 outline-none font-medium"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={addAlarm}
                    className="px-4 py-1.5 rounded-full bg-amber-400 font-['Orbitron'] font-black text-[10px] cursor-pointer active:scale-95"
                  >
                    SAVE ALARM
                  </button>
                </div>
              </div>
            )}

            {/* List of Multiple Alarms */}
            <div className="space-y-2">
              {alarms.map((a) => (
                <div
                  key={a.id}
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                    a.enabled ? 'bg-amber-50/50 border-amber-300' : 'bg-neutral-50 border-neutral-200 opacity-60'
                  }`}
                >
                  <div className="flex-1 mr-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={a.time}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAlarms((prev) =>
                            prev.map((item) => (item.id === a.id ? { ...item, time: val } : item))
                          );
                        }}
                        className="font-['Orbitron'] font-black text-lg bg-transparent text-neutral-900 outline-none"
                      />
                      <span className="text-[8px] font-mono text-neutral-500">EAT</span>
                    </div>
                    <input
                      value={a.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAlarms((prev) =>
                          prev.map((item) => (item.id === a.id ? { ...item, label: val } : item))
                        );
                      }}
                      className="text-[11px] font-medium text-neutral-700 bg-transparent outline-none w-full"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Test Button */}
                    <button
                      onClick={() =>
                        speakAsilia(
                          `Good morning Boss Prof Mark! It is ${a.time} EAT Nairobi. Alarm alert: ${a.label}. MK-IV Reactor output is optimal on your Galaxy A07.`
                        )
                      }
                      title="Test Voice Call"
                      className="px-2 py-1 text-[8px] font-['Orbitron'] font-bold bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 active:scale-95 cursor-pointer"
                    >
                      TEST
                    </button>

                    {/* Enable Toggle Switch */}
                    <button
                      onClick={() => {
                        setAlarms((prev) =>
                          prev.map((item) => (item.id === a.id ? { ...item, enabled: !item.enabled } : item))
                        );
                      }}
                      className={`w-11 h-6 rounded-full p-0.5 transition cursor-pointer ${
                        a.enabled ? 'bg-amber-400' : 'bg-neutral-300'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white shadow transform transition ${
                          a.enabled ? 'translate-x-5' : ''
                        }`}
                      />
                    </button>

                    {/* Delete Alarm */}
                    <button
                      onClick={() => setAlarms((prev) => prev.filter((item) => item.id !== a.id))}
                      className="text-[11px] opacity-40 hover:opacity-100 cursor-pointer ml-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Voice Engine Settings (Zuri Swahili/Sheng Expert Female + Asilia English Kenyan Warm) */}
            <div className="mt-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="font-['Orbitron'] font-bold text-[10px] text-neutral-800">
                  DUAL NEURAL VOICE SELECTOR
                </span>
                <span className="text-[8px] font-mono text-pink-600 font-bold">
                  {selectedVoiceMode === 'zuri' ? 'ZURI (SWAHILI)' : (selectedVoiceMode === 'asilia' ? 'ASILIA (ENGLISH)' : 'AUTO-DETECT')}
                </span>
              </div>

              <select
                value={selectedVoiceMode}
                onChange={(e) => setSelectedVoiceMode(e.target.value)}
                className="w-full text-[11px] bg-white border border-neutral-300 rounded-lg p-2.5 outline-none font-medium shadow-sm"
              >
                <option value="auto">Auto-Detect: Zuri (sw-KE-ZuriNeural) / Asilia (en-KE-AsiliaNeural)</option>
                <optgroup label="Edge TTS Voice Engine (PC Mode)">
                  <option value="zuri">Zuri (Swahili Sheng Expert) -&gt; sw-KE-ZuriNeural</option>
                  <option value="asilia">Asilia (English Kenyan Warm) -&gt; en-KE-AsiliaNeural</option>
                </optgroup>
                {availableVoices.length > 0 && (
                  <optgroup label="Other Voices">
                    {availableVoices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  onClick={() => {
                    const resolved = resolveEdgeVoice('sw', 'zuri', availableVoices);
                    const u = new SpeechSynthesisUtterance('Mambo niaje Prof Mark! Mimi ni Zuri, mtaalamu wa Kiswahili na Sheng. Rada iko safi sana kwenye Akili V8!');
                    if (resolved.speechSynthesisVoice) u.voice = resolved.speechSynthesisVoice;
                    u.lang = resolved.speechSynthesisVoice?.lang || resolved.lang;
                    u.rate = resolved.rate;
                    u.pitch = resolved.pitch;
                    u.volume = resolved.volume;
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(u);
                  }}
                  className="py-2.5 px-2 bg-gradient-to-r from-pink-500 to-[#d81b60] text-white font-['Orbitron'] font-black text-[9px] rounded-lg active:scale-95 transition shadow cursor-pointer text-center"
                >
                  TEST ZURI (sw-KE-ZuriNeural)
                </button>
                <button
                  onClick={() => {
                    const resolved = resolveEdgeVoice('en', 'asilia', availableVoices);
                    const u = new SpeechSynthesisUtterance('Hello Boss Prof Mark! This is Asilia speaking with warm Kenyan cadence on your Galaxy A07.');
                    if (resolved.speechSynthesisVoice) u.voice = resolved.speechSynthesisVoice;
                    u.lang = resolved.speechSynthesisVoice?.lang || resolved.lang;
                    u.rate = resolved.rate;
                    u.pitch = resolved.pitch;
                    u.volume = resolved.volume;
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(u);
                  }}
                  className="py-2.5 px-2 bg-gradient-to-r from-amber-400 to-amber-500 text-black font-['Orbitron'] font-black text-[9px] rounded-lg active:scale-95 transition shadow cursor-pointer text-center"
                >
                  TEST ASILIA (en-KE-AsiliaNeural)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TASKS */}
        {tab === 'tasks' && (
          <div className="space-y-2 overflow-y-auto flex-1 touch-pan-y scrollbar-none pb-2 text-neutral-900">
            <div className="bg-white rounded-[16px] p-3 shadow-md space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-['Orbitron'] font-black text-[12px] text-[#9c6500]">
                    Prof Mark Action Tasks
                  </div>
                  <div className="text-[9px] font-mono text-neutral-500">
                    Type or say "Add task..." to automatically clean &amp; add
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-['Orbitron'] font-black text-[9px]">
                  {tasks.filter((t) => !t.done).length} ACTIVE
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTask.trim()) {
                      const clean = cleanTaskTitle(newTask);
                      setTasks((p) => [{ id: Date.now().toString(), title: clean, done: false }, ...p]);
                      setNewTask('');
                      speakAsilia(`Task added: ${clean}`);
                    }
                  }}
                  placeholder="Type new task (e.g. Tomorrow is my birthday)..."
                  className="flex-1 bg-black/5 rounded-full px-3.5 py-2 text-[12px] outline-none font-medium"
                />
                <button
                  onClick={() => {
                    if (newTask.trim()) {
                      const clean = cleanTaskTitle(newTask);
                      setTasks((p) => [{ id: Date.now().toString(), title: clean, done: false }, ...p]);
                      setNewTask('');
                      speakAsilia(`Task added: ${clean}`);
                    }
                  }}
                  className="px-4 py-2 rounded-full bg-amber-400 font-['Orbitron'] font-black text-[11px] cursor-pointer active:scale-95"
                >
                  ADD
                </button>
              </div>
            </div>

            {tasks.map((t) => (
              <div
                key={t.id}
                className="bg-white rounded-[16px] p-3 flex gap-2.5 items-start shadow-sm transition-all"
              >
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() =>
                    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
                  }
                  className="mt-1 w-4 h-4 cursor-pointer accent-pink-600 rounded"
                />
                <div className={`flex-1 ${t.done ? 'line-through opacity-50' : ''}`}>
                  <div className="font-bold text-[12px] text-neutral-900">{t.title}</div>
                </div>
                <button
                  onClick={() => setTasks((p) => p.filter((x) => x.id !== t.id))}
                  className="text-[11px] opacity-40 hover:opacity-100 cursor-pointer px-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* FIXED BOTTOM CHAT BAR WITH ENHANCED MIC + LANGUAGE SWITCHER */}
      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-2 bg-gradient-to-t from-black via-black/95 to-transparent">
        {/* Live speech feedback pill so user sees what mic heard */}
        {lastTranscript && (
          <div className="mx-auto max-w-[390px] mb-1.5 flex items-center justify-between px-3 py-1 bg-white/10 backdrop-blur rounded-lg border border-white/10 text-[9px] text-amber-200 font-mono">
            <span className="truncate mr-2">Heard: "{lastTranscript}"</span>
            <button
              onClick={() => setLastTranscript('')}
              className="text-white/60 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        <div className="mx-auto max-w-[390px] bg-white rounded-full px-2 py-1.5 flex items-center gap-1.5 shadow-2xl">
          {/* Push-to-talk mic button: Tap to listen, tap to stop */}
          <button
            onClick={toggleMicPushToTalk}
            className={`w-9 h-9 rounded-full grid place-items-center transition cursor-pointer text-sm shrink-0 ${
              micOn ? 'bg-red-500 animate-pulse text-white shadow-[0_0_12px_#ef4444]' : 'bg-black/10 text-black hover:bg-black/20'
            }`}
            title={micOn ? 'Mic ON (Tap to stop & send)' : 'Push-to-Talk (Echo-cancelled)'}
          >
            {micOn ? '●' : '🎤'}
          </button>

          {/* Language Toggle Pill: en-KE vs sw-KE */}
          <button
            onClick={() => setMicLang(micLang === 'en-KE' ? 'sw-KE' : 'en-KE')}
            className="text-[8px] font-['Orbitron'] font-bold px-2 py-1 rounded-full bg-neutral-100 text-neutral-800 hover:bg-amber-200 transition cursor-pointer shrink-0"
            title="Switch speech recognition language"
          >
            🇰🇪 {micLang}
          </button>

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            className="flex-1 bg-transparent outline-none text-[12.5px] text-black placeholder:text-black/45 font-medium min-w-0"
            placeholder={micOn ? 'Listening... speak now' : 'Ask in English or Swahili...'}
          />

          {/* TULIA button: Instantly stops all speech & mic */}
          <button
            onClick={stopAllSpeech}
            className="px-2.5 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white font-['Orbitron'] font-black text-[9px] cursor-pointer active:scale-95 transition shrink-0 shadow-sm"
          >
            TULIA
          </button>

          {/* SEND button */}
          <button
            onClick={() => send()}
            className="px-3.5 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 font-['Orbitron'] font-black text-[10.5px] text-black cursor-pointer active:scale-95 transition shrink-0 shadow-sm"
          >
            SEND
          </button>
        </div>

        {/* Quick query chips */}
        <div className="mx-auto max-w-[390px] flex justify-center gap-1.5 mt-1.5">
          <button
            onClick={() => send('Who am I?')}
            className="text-[8px] px-2.5 py-1 rounded-full bg-white/10 text-white/80 border border-white/10 cursor-pointer active:scale-95 hover:bg-white/20"
          >
            Who am I?
          </button>
          <button
            onClick={() => send('Mimi ni nani na Akili inafanya nini?')}
            className="text-[8px] px-2.5 py-1 rounded-full bg-white/10 text-white/80 border border-white/10 cursor-pointer active:scale-95 hover:bg-white/20"
          >
            Mimi ni nani?
          </button>
          <button
            onClick={() => send('How is the MK-IV Reactor performing?')}
            className="text-[8px] px-2.5 py-1 rounded-full bg-white/10 text-white/80 border border-white/10 cursor-pointer active:scale-95 hover:bg-white/20"
          >
            MK-IV Status
          </button>
        </div>
      </div>

      {/* 5. RESTORED MK-IV GALAXY REACTOR (PURE CSS 2 RINGS, GOLD & PINK, PUSH-TO-TALK GESTURE) */}
      <div
        onPointerDown={onPointerDownOrb}
        onClick={onDoubleTapOrb}
        className={`touch-none select-none cursor-grab active:cursor-grabbing ${
          enlarged
            ? 'fixed w-[300px] h-[300px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[90]'
            : 'w-[84px] h-[84px]'
        }`}
        style={
          !enlarged
            ? {
                top: '78px',
                right: '14px',
                position: 'fixed',
                zIndex: 40,
                transform: `translate3d(${pos.x}px,${pos.y}px,0)`,
                willChange: 'transform',
                transition: charging ? 'none' : 'transform 0.1s ease-out'
              }
            : { zIndex: 90 }
        }
      >
        {/* SVG Gold Charging Ring (700ms Long-press trigger) */}
        <svg
          className={`absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)] -rotate-90 pointer-events-none transition-opacity duration-200 ${
            charging ? 'opacity-100' : 'opacity-0'
          }`}
          viewBox="0 0 120 120"
        >
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="#ffd700"
            strokeWidth="3.5"
            strokeDasharray="339"
            strokeDashoffset={charging ? '0' : '339'}
            style={{ transition: 'stroke-dashoffset 0.7s linear' }}
          />
        </svg>

        {/* MK-IV Black Glass Galaxy Core with Conic Nebula Spiral */}
        <div
          className={`w-full h-full rounded-full relative overflow-hidden ${micOn ? 'ring-4 ring-red-500' : ''}`}
          style={{
            background:
              'radial-gradient(at 30% 30%, #ffec8b 0%, #ffd700 15%, #ff6a00 32%, #ff1493 55%, #5d0063 75%, #000000 100%)',
            boxShadow:
              '0 0 35px #ff1493, 0 0 75px #ffd700 inset, 0 0 18px #ffec8b',
            animation: 'breathe 3s ease-in-out infinite'
          }}
        >
          {/* Conic Gradient Spiral */}
          <div
            className="absolute inset-[8%] rounded-full animate-spin [animation-duration:7s] opacity-95"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg, #ff1493 50deg, #ff6a00 120deg, #ffd700 200deg, #ff1493 280deg, transparent 360deg)',
              mask: 'radial-gradient(circle, black 16%, transparent 68%)',
              WebkitMask: 'radial-gradient(circle, black 16%, transparent 68%)'
            }}
          />

          {/* Micro Specular Stardust */}
          <div
            className="absolute inset-0 opacity-75 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 35% 35%, #fff 1.2px, transparent 1.6px), radial-gradient(circle at 65% 55%, #ffd700 1.2px, transparent 1.6px)'
            }}
          />

          {/* Black Hole Singularity Center 20% with Gold Border */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[20%] h-[20%] rounded-full bg-black border border-[#ffd700aa] shadow-[inset_0_0_8px_#000]" />
        </div>

        {/* RING 1: 134% size, border 1.5px #d4af37, spin 7s with gold bead top 4% left 84% */}
        <div className="absolute top-1/2 left-1/2 w-[134%] h-[134%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-[#d4af37] shadow-[0_0_8px_#ffd70066] animate-spin [animation-duration:7s] pointer-events-none">
          <div className="absolute top-[4%] left-[84%] w-[6px] h-[6px] rounded-full bg-[#ffec8b] shadow-[0_0_6px_#ffd700]" />
        </div>

        {/* RING 2: 152% size, border 1px #ffd700bb, spin 13s reverse with pink bead bottom 12% right 10% */}
        <div className="absolute top-1/2 left-1/2 w-[152%] h-[152%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1px] border-[#ffd700bb] opacity-80 animate-spin [animation-duration:13s] [animation-direction:reverse] pointer-events-none">
          <div className="absolute bottom-[12%] right-[10%] w-[5px] h-[5px] rounded-full bg-[#ff1493] shadow-[0_0_6px_#ff1493]" />
        </div>

        {/* ENLARGED 310PX TYPE BOX MODAL */}
        {enlarged && showType && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-full mt-4 left-1/2 -translate-x-1/2 w-[310px] bg-white rounded-[18px] p-3.5 shadow-2xl text-neutral-900 border border-amber-300"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="font-['Orbitron'] text-[11px] font-black text-[#9c6500]">
                Akili Reactor Quick Query
              </span>
              <span className="text-[9px] font-mono text-neutral-500">310px HUD</span>
            </div>

            <div className="flex gap-2">
              <input
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Ask in English or Swahili..."
                className="flex-1 bg-black/5 rounded-full px-3.5 py-2 text-[12px] outline-none font-medium"
              />
              <button
                onClick={() => send()}
                className="px-4 py-2 rounded-full bg-amber-400 font-['Orbitron'] font-black text-[11px] cursor-pointer active:scale-95"
              >
                SEND
              </button>
            </div>

            <div className="flex gap-2 mt-2.5">
              <button
                onClick={stopAllSpeech}
                className="flex-1 py-2 rounded-full bg-red-500 hover:bg-red-600 text-white font-['Orbitron'] font-black text-[10px] cursor-pointer active:scale-95 transition"
              >
                TULIA HAPO - STOP
              </button>
              <button
                onClick={() => {
                  setEnlarged(false);
                  setShowType(false);
                }}
                className="flex-1 py-2 rounded-full bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-['Orbitron'] font-black text-[10px] cursor-pointer active:scale-95 transition"
              >
                CLOSE
              </button>
            </div>
            <div className="text-[8px] opacity-60 mt-2 text-center font-mono">
              Push-to-Talk: Long-press reactor to start/stop listening
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
