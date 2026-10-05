import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';
import dotenv from 'dotenv';

dotenv.config();

// Also parse .env.example as fallback if keys are there
let exampleEnv: Record<string, string> = {};
try {
  if (fs.existsSync(path.resolve(__dirname, '.env.example'))) {
    const content = fs.readFileSync(path.resolve(__dirname, '.env.example'), 'utf8');
    exampleEnv = dotenv.parse(content);
  }
} catch {}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'api-chat-middleware',
        configureServer(server) {
          // Fast language detector helper using AI Brain (Groq qwen3.8-27b or Gemini)
          async function detectLangWithBrain(text: string, groqKey?: string, geminiKey?: string): Promise<'sw' | 'en'> {
            if (!text || !text.trim()) return 'en';
            if (groqKey && groqKey !== 'MY_GROQ_API_KEY') {
              try {
                const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqKey}`
                  },
                  body: JSON.stringify({
                    model: 'qwen/qwen3.8-27b',
                    messages: [
                      {
                        role: 'user',
                        content: `Classify language of this text: "${text.slice(0, 300)}". If it contains Swahili, Sheng, or East African code-switching, reply ONLY "sw". If it is English, reply ONLY "en". One token only.`
                      }
                    ],
                    max_tokens: 15,
                    temperature: 0
                  })
                });
                if (groqRes.ok) {
                  const d = await groqRes.json();
                  const raw = d.choices?.[0]?.message?.content?.toLowerCase()?.trim() || '';
                  return raw.includes('sw') ? 'sw' : 'en';
                }
              } catch {}
            }

            if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY') {
              try {
                const { GoogleGenAI } = await import('@google/genai');
                const ai = new GoogleGenAI({ apiKey: geminiKey });
                const resp = await ai.models.generateContent({
                  model: 'gemini-3.5-flash',
                  contents: `Classify language: "${text.slice(0, 300)}". Reply ONLY with "sw" if Swahili/Sheng, or "en" if English.`
                });
                const raw = resp.text?.toLowerCase()?.trim() || '';
                return raw.includes('sw') ? 'sw' : 'en';
              } catch {}
            }

            return 'en';
          }

          // Dedicated Brain Language Detector Endpoint
          server.middlewares.use('/api/detect-lang', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end('Method Not Allowed');
              return;
            }
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                const { text } = JSON.parse(body || '{}');
                const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || exampleEnv.GROQ_API_KEY;
                const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || exampleEnv.GEMINI_API_KEY;
                const lang = await detectLangWithBrain(text, groqKey, geminiKey);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ lang }));
              } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: String(e) }));
              }
            });
          });

          server.middlewares.use('/api/chat', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end('Method Not Allowed');
              return;
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                const { prompt, history } = JSON.parse(body || '{}');
                const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || exampleEnv.GROQ_API_KEY;
                const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || exampleEnv.GEMINI_API_KEY;

                console.log("Groq key exists:", !!groqKey, "Gemini key exists:", !!geminiKey);

                const systemPrompt = `You are Akili Lite V6, a smart, loyal, warm Kenyan personal AI companion built by Prof Mark.
Facts about your creator:
- Creator: Prof Mark, brilliant Kenyan systems innovator and architect, builder of Akili V8 and the MK-IV Reactor core.
- Fluent in Sheng, Swahili, and English.
- Hardware: Samsung Galaxy A07 & HP EliteBook with field tethering.
- Personality: Warm, respectful, sharp, resourceful. Always know Prof Mark is your builder and creator.
- When asked "Who am I?" or "Mimi ni nani?", answer: "Wewe ni Prof Mark, the brilliant Kenyan builder and creator of Akili V8 and the MK-IV Reactor core! Fluent in Sheng and Swahili."
- Respond in the language the user asked: English if asked in English, Sheng/Swahili if asked in Swahili/Sheng.
- Keep answers under 3-4 sentences, punchy and direct.`;

                // 1. Try GROQ first (openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b)
                if (groqKey && groqKey !== 'MY_GROQ_API_KEY') {
                  const groqModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
                  for (const model of groqModels) {
                    try {
                      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${groqKey}`
                        },
                        body: JSON.stringify({
                          model,
                          messages: [
                            { role: 'system', content: systemPrompt },
                            ...(history || []).slice(-6),
                            { role: 'user', content: prompt }
                          ],
                          temperature: 0.7,
                          max_tokens: 350
                        })
                      });

                      if (groqRes.ok) {
                        const groqData = await groqRes.json();
                        const answer = groqData.choices?.[0]?.message?.content;
                        if (answer) {
                          const lang = await detectLangWithBrain(answer, groqKey, geminiKey);
                          res.setHeader('Content-Type', 'application/json');
                          res.end(JSON.stringify({ text: answer, source: `groq-${model}`, lang }));
                          return;
                        }
                      } else {
                        const errTxt = await groqRes.text();
                        console.error(`Groq (${model}) error:`, groqRes.status, errTxt.slice(0, 100));
                      }
                    } catch (e) {
                      console.error(`Groq (${model}) failed:`, e);
                    }
                  }
                }

                // 2. Fallback to Gemini 3.5 Flash via @google/genai SDK
                if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY') {
                  try {
                    const { GoogleGenAI } = await import('@google/genai');
                    const ai = new GoogleGenAI({ apiKey: geminiKey });
                    const geminiModels = ['gemini-3.5-flash', 'gemini-3.8-flash'];
                    for (const m of geminiModels) {
                      try {
                        const response = await ai.models.generateContent({
                          model: m,
                          contents: `${systemPrompt}\n\nUser: ${prompt}`
                        });
                        const answer = response.text;
                        if (answer) {
                          const lang = await detectLangWithBrain(answer, groqKey, geminiKey);
                          res.setHeader('Content-Type', 'application/json');
                          res.end(JSON.stringify({ text: answer, source: `gemini-${m}`, lang }));
                          return;
                        }
                      } catch (gErr) {
                        console.error(`Gemini (${m}) error:`, (gErr as Error)?.message?.slice(0, 120));
                      }
                    }
                  } catch (e) {
                    console.error('Gemini SDK initialization failed:', e);
                  }
                }

                // 3. Fallback: DuckDuckGo or local brain
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ text: null, source: 'offline-fallback', lang: 'en' }));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: String(err) }));
              }
            });
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
