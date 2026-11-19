// Fitur custom yang dibuat admin lewat web controller — hot reload,
// tidak perlu restart bot.
import { getJSON } from '../../store.js';
import { config, hasAI } from '../../config.js';
import * as logger from '../../logger.js';
import { aiChat } from '../../ai.js';
import { isVerified, bump } from '../users.js';
import { verificationReminder } from './verify.js';

export function findCustom(id) {
  const f = getJSON('features', { builtin: [], custom: [] });
  return (f.custom || []).find((x) => x.id === id);
}

export function matchCustomFeature(text) {
  const f = getJSON('features', { builtin: [], custom: [] });
  const t = String(text || '').toLowerCase().trim();
  if (!t) return null;
  return (f.custom || []).find((x) => {
    if (!x.enabled) return false;
    const trig = String(x.trigger || '').trim();
    if (!trig) return false;
    try {
      if (x.type === 'command') {
        const clean = trig.replace(/^\//, '').toLowerCase();
        return t === clean || t === `/${clean}`;
      }
      if (x.type === 'keyword') return t.includes(trig.toLowerCase());
      if (x.type === 'regex') return new RegExp(trig, 'i').test(text);
    } catch { /* regex rusak, skip */ }
    return false;
  });
}

export async function sendLong(ctx, text) {
  const MAX = 3800;
  const str = String(text || '');
  for (let i = 0; i < str.length; i += MAX) {
    await ctx.reply(str.slice(i, i + MAX));
  }
}

export async function runCustomFeature(ctx, feat, inputText = '') {
  if (!feat || !feat.enabled) {
    return ctx.reply('✨ Fitur ini sedang dimatikan admin. Coba lagi nanti ya.');
  }
  if (!isVerified(ctx.from.id)) return verificationReminder(ctx);

  bump('messages'); // sudah dihitung di touchUser, ini opsional — aman diabaikan

  if (feat.replyType === 'ai') {
    if (!hasAI()) {
      return ctx.reply('🤖 Fitur AI belum aktif — admin belum mengisi AI_API_KEY di server.');
    }
    const wait = await ctx.reply('🤖 Sebentar, aku mikir dulu…');
    await ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
    try {
      const persona = feat.aiPrompt
        || `Kamu asisten Telegram resmi "${config.brand}". Gaya bicara santai, ramah, sedikit humor, tapi tetap profesional. Jawab ringkas dan jelas dalam Bahasa Indonesia.`;
      const out = await aiChat([
        { role: 'system', content: persona },
        { role: 'user', content: inputText || feat.name },
      ]);
      await ctx.api.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
      return sendLong(ctx, out || '(AI tidak membalas apa pun, coba lagi ya)');
    } catch (e) {
      logger.error(`fitur AI "${feat.name}": ${e.message}`);
      await ctx.api.editMessageText(ctx.chat.id, wait.message_id, '😵 AI-nya lagi bermasalah. Coba lagi sebentar lagi ya.');
      return;
    }
  }

  const txt = String(feat.reply || '')
    .replace(/\{name\}/g, ctx.from.first_name || 'kawan')
    .trim() || 'Fitur ini belum diisi balasannya — minta admin mengaturnya di web controller ya.';
  return sendLong(ctx, txt);
}
