import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function detectFlutter() {
  try {
    execFileSync('which', ['flutter'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export const config = {
  brand: 'YowisBen Dev',
  version: '1.0.0',

  // Telegram
  token: process.env.BOT_TOKEN || '',
  adminId: Number(process.env.TELEGRAM_ADMIN_ID || 0) || null,
  waChannel: process.env.WA_CHANNEL || 'https://whatsapp.com/channel/0029VanLoUuJuyAGCiRZuL3V',

  // Web admin (bisa beberapa password sekaligus, pisahkan dengan koma)
  adminPasswords: String(process.env.ADMIN_PASSWORD || 'yowisben123')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  sessionSecret: process.env.SESSION_SECRET || '',
  // Di Railway otomatis pakai domain publik yang tersedia
  publicUrl: (
    process.env.PUBLIC_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
    || 'http://localhost:3000'
  ).replace(/\/+$/, ''),

  // Penyimpanan
  dataDir: process.env.RAILWAY_VOLUME_MOUNT || process.env.DATA_DIR || path.join(ROOT, 'data'),
  tmpDir: process.env.TMP_DIR || os.tmpdir(),

  // AI (kompatibel OpenAI: OpenAI, Groq, Gemini openai-compat, z.ai, dll.)
  ai: {
    key: process.env.AI_API_KEY || '',
    baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    visionModel: process.env.AI_VISION_MODEL || process.env.AI_MODEL || 'gpt-4o-mini',
  },

  // Netlify (opsional — kalau terisi, website user di-deploy ke *.netlify.app;
  // kalau kosong, website dihosting di server bot: {publicUrl}/sites/<nama>/)
  netlifyKey: process.env.NETLIFY_API_KEY || '',

  // yt-dlp
  ytCookies: process.env.YTDLP_COOKIES || '',
  maxVideoMb: Number(process.env.MAX_VIDEO_MB || 48),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 20),
  buildTimeoutMin: Number(process.env.BUILD_TIMEOUT_MIN || 30),

  hasFlutter: detectFlutter(),
};

export const hasAI = () => Boolean(config.ai.key);
export const hasNetlify = () => Boolean(config.netlifyKey);
