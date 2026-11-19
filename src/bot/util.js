import { config } from '../config.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function downloadBuffer(filePath) {
  const url = `https://api.telegram.org/file/bot${config.token}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`unduh file dari Telegram gagal (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fmtBytes(n) {
  if (!n && n !== 0) return '?';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function fmtDur(sec) {
  const s = Math.round(Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}j ${m}m`;
  if (m) return `${m}m ${r}s`;
  return `${r}s`;
}

export function sanitizeFilename(name, max = 60) {
  return String(name || 'file').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, max).trim() || 'file';
}

export async function safeEdit(ctx, msgRef, text) {
  try {
    await ctx.api.editMessageText(ctx.chat.id, msgRef.message_id, text);
  } catch { /* edit boleh gagal diam-diam */ }
}
