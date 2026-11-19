// Manager bot: start / stop / restart dari web admin.
import { config } from '../config.js';
import * as logger from '../logger.js';
import { createBot } from './bot.js';

let bot = null;
let state = 'stopped'; // stopped | starting | running | error
let startedAt = null;
let lastError = null;
let starting = false;
let botUsername = null;

export function getBot() {
  return bot;
}

export function info() {
  return {
    state,
    lastError,
    startedAt,
    uptime: state === 'running' && startedAt ? Date.now() - startedAt : 0,
    hasToken: Boolean(config.token),
    hasFlutter: config.hasFlutter,
    hasAI: Boolean(config.ai.key),
    botUsername,
  };
}

function notifyState(msg) {
  if (msg) logger.info(msg);
}

export async function start() {
  if (starting) return info();
  if (state === 'running') return info();
  if (!config.token) {
    state = 'error';
    lastError = 'BOT_TOKEN belum diisi di environment';
    notifyState('Start bot gagal: BOT_TOKEN kosong');
    return info();
  }
  starting = true;
  state = 'starting';
  lastError = null;
  try {
    if (!bot) bot = createBot();
    await bot.init(); // validasi token via getMe — lempar error kalau token salah / jaringan mati
    botUsername = bot.botInfo?.username || null;
    bot.start()
      .then(() => {
        if (state === 'running') {
          state = 'stopped';
          notifyState('Polling bot berhenti');
        }
      })
      .catch((err) => {
        if (state === 'running') {
          state = 'error';
          lastError = err?.message || String(err);
          logger.error(`Bot berhenti tak terduga: ${lastError}`);
        }
      });
    state = 'running';
    startedAt = Date.now();
    logger.success(`Bot @${bot.botInfo.username} online (long polling)`);
  } catch (e) {
    state = 'error';
    lastError = e?.message || String(e);
    logger.error(`Gagal start bot: ${lastError}`);
  } finally {
    starting = false;
  }
  return info();
}

export async function stop() {
  try {
    if (bot && state === 'running') {
      await bot.stop();
    }
    state = 'stopped';
    logger.info('Bot dimatikan via web controller');
  } catch (e) {
    state = 'error';
    lastError = e?.message || String(e);
    logger.error(`Gagal stop bot: ${lastError}`);
  }
  return info();
}

export async function restart() {
  logger.info('Restart bot…');
  await stop();
  return start();
}

export function bootLog() {
  if (!config.token) {
    logger.warn('BOT_TOKEN kosong — bot tidak auto-start. Isi variable lalu tekan Start di web admin.');
  }
}
