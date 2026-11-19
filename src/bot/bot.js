// Router utama bot. Semua pesan masuk lewat sini.
import { Bot } from 'grammy';
import { config } from '../config.js';
import * as logger from '../logger.js';
import { touchUser, getUser, isVerified } from './users.js';
import { getSession, resetSession } from './sessions.js';
import { buildMenuKeyboard, menuText, statusText, helpText, adminStatsText } from './flows/menu.js';
import { startVerification, handleVerificationPhoto, handleManualVerifyCallback } from './flows/verify.js';
import { startApkFlow, handleApkZip } from './flows/apk.js';
import { handleVideo, isProbablyUrl } from './flows/video.js';
import { startWebFlow, handleWebDomain, handleWebFile } from './flows/webdeploy.js';
import { matchCustomFeature, runCustomFeature, findCustom } from './flows/custom.js';

function sendMenu(ctx) {
  const name = ctx.from.first_name || 'kawan';
  return ctx.reply(menuText(name), { reply_markup: { inline_keyboard: buildMenuKeyboard() } });
}

async function handleCommand(ctx, s, text) {
  const cmd = text.split(/\s+/)[0].toLowerCase().split('@')[0];
  const uid = ctx.from.id;

  switch (cmd) {
    case '/start':
      resetSession(uid);
      return isVerified(uid) ? sendMenu(ctx) : startVerification(ctx);
    case '/menu':
      return isVerified(uid) ? sendMenu(ctx) : startVerification(ctx);
    case '/help':
      return isVerified(uid) ? ctx.reply(helpText()) : startVerification(ctx);
    case '/batal':
    case '/cancel':
      resetSession(uid);
      return ctx.reply('👍 Oke, dibatalkan. Ketik /menu kalau mau lanjut.');
    case '/deployapk':
    case '/apk':
      return startApkFlow(ctx, s);
    case '/deployweb':
    case '/web':
      return startWebFlow(ctx, s);
    case '/video': {
      const arg = text.split(/\s+/).slice(1).join(' ').trim();
      if (!arg) {
        return ctx.reply('📥 Formatnya: /video <link>\nAtau cukup tempel link-nya doang, aku otomatis proses. 😎');
      }
      return handleVideo(ctx, arg);
    }
    case '/status':
      return ctx.reply(statusText(getUser(uid)));
    case '/stats':
      if (config.adminId && String(ctx.from.id) === String(config.adminId)) {
        return ctx.reply(adminStatsText());
      }
      break;
    case '/ping':
      return ctx.reply('pong ⚡');
    default:
      break;
  }

  const feat = matchCustomFeature(cmd);
  if (feat) return runCustomFeature(ctx, feat, text);
  return ctx.reply(`❓ Perintah ${cmd} belum ada.\nKetik /menu untuk daftar fitur.`);
}

async function handleDocument(ctx, s) {
  const uid = ctx.from.id;
  const doc = ctx.message.document;
  if (s.stage === 'apk_file') return handleApkZip(ctx, s, doc);
  if (s.stage === 'web_file') return handleWebFile(ctx, s, doc);
  if (isVerified(uid)) {
    return ctx.reply(
      [
        '📎 File diterima, tapi belum dalam mode apa-apa.',
        '',
        '• Untuk deploy APK: /deployapk',
        '• Untuk deploy website: /deployweb',
      ].join('\n'),
    );
  }
  return startVerification(ctx);
}

export function createBot() {
  const bot = new Bot(config.token);

  bot.catch((err) => {
    const e = err?.error || err;
    logger.error(`bot.catch: ${e?.message || e}`);
  });

  bot.use(async (ctx, next) => {
    try {
      if (ctx.from && !ctx.from.is_bot) touchUser(ctx.from);
    } catch { /* biarkan update tetap jalan */ }
    await next();
  });

  bot.on('message', async (ctx) => {
    const uid = ctx.from.id;
    const user = getUser(uid);
    if (user?.banned) return; // user diblokir admin — diabaikan

    const s = getSession(uid);
    const msg = ctx.message;
    const text = (msg.text || msg.caption || '').trim();

    try {
      if (text.startsWith('/')) return await handleCommand(ctx, s, text);
      if (msg.photo && msg.photo.length) return await handleVerificationPhoto(ctx, s);
      if (msg.document) return await handleDocument(ctx, s);
      if (s.stage === 'web_domain') return await handleWebDomain(ctx, s, text);
      if (isProbablyUrl(text)) return await handleVideo(ctx, text);

      const feat = matchCustomFeature(text);
      if (feat) return await runCustomFeature(ctx, feat, text);

      if (!isVerified(uid)) return await startVerification(ctx);
      return await ctx.reply('🤔 Hmm, aku belum paham maksudmu.\nKetik /menu buat lihat semua fitur ya. 🙂');
    } catch (e) {
      logger.error(`handler (${uid}): ${e.message}`);
      await ctx.reply('⚠️ Uppss, ada error di server. Tim udah dapat catatannya, coba lagi ya.').catch(() => {});
    }
  });

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data || '';
    try { await ctx.answerCallbackQuery(); } catch { /* diamkan */ }
    const uid = ctx.from.id;

    try {
      if (data.startsWith('v:ok:') || data.startsWith('v:no:')) {
        return await handleManualVerifyCallback(ctx, data);
      }
      if (userBanned(uid)) return;

      if (data.startsWith('menu:')) {
        if (!isVerified(uid)) return startVerification(ctx);
        const what = data.slice(5);
        const s = getSession(uid);
        if (what === 'apk') return startApkFlow(ctx, s);
        if (what === 'web') return startWebFlow(ctx, s);
        if (what === 'status') return ctx.reply(statusText(getUser(uid)));
        if (what === 'help') return ctx.reply(helpText());
        return;
      }
      if (data.startsWith('c:')) {
        const feat = findCustom(data.slice(2));
        if (feat) return runCustomFeature(ctx, feat, '');
      }
    } catch (e) {
      logger.error(`callback (${data}): ${e.message}`);
    }
  });

  return bot;
}

function userBanned(uid) {
  return Boolean(getUser(uid)?.banned);
}
