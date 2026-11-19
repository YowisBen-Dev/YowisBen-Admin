// Klien AI kompatibel OpenAI (chat + vision).
// Bisa dipakai untuk OpenAI, Groq, z.ai GLM-4V, dsb. lewat AI_BASE_URL.
import { config, hasAI } from './config.js';
import * as logger from './logger.js';

async function call(body) {
  const res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai.key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`AI ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
}

export async function aiChat(messages, { temperature = 0.7, model } = {}) {
  if (!hasAI()) throw new Error('AI belum dikonfigurasi (AI_API_KEY kosong)');
  return call({ model: model || config.ai.model, messages, temperature });
}

export async function aiVision(b64, mime, prompt) {
  if (!hasAI()) throw new Error('AI belum dikonfigurasi (AI_API_KEY kosong)');
  logger.info('AI vision: menganalisis screenshot verifikasi…');
  return call({
    model: config.ai.visionModel,
    temperature: 0.1,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
      ],
    }],
  });
}

export function extractJSON(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
