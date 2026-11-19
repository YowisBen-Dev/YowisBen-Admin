// Fitur Download Video: user cukup kirim link → yt-dlp ambil video →
// kirim sebagai file. Mendukung ratusan situs (YouTube, TikTok, IG, dsb.).
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { InputFile } from 'grammy';
import { config } from '../../config.js';
import * as logger from '../../logger.js';
import { videoQueue } from '../../queue.js';
import { downloadBuffer, esc, fmtBytes, fmtDur, safeEdit, sanitizeFilename } from '../util.js';
import { bump, featureOn, getUser, users } from '../users.js';

const p = promisify(execFile);

export function isProbablyUrl(text) {
  return /^https?:\/\/\S+$/i.test(String(text || '').trim());
}

function commonArgs() {
  const args = ['--no-playlist', '--socket-timeout', '25', '--retries', '3'];
  if (config.ytCookies && fs.existsSync(config.ytCookies)) {
    args.push('--cookies', config.ytCookies);
  }
  return args;
}

export async function handleVideo(ctx, url) {
  if (!featureOn('video')) {
    return ctx.reply('📥 Fitur download video sedang dimatikan admin. Coba lagi nanti ya.');
  }
  url = url.trim();
  let host = 'link';
  try {
    host = new URL(url).hostname;
  } catch { /* biarkan */ }

  const info = await ctx.reply(`🔎 Mengambil info dari ${host}…`);
  const pos = videoQueue.size;
  if (pos > 0) await safeEdit(ctx, info, `🔎 Antrian download: ${pos}. Sebentar lagi ya…`);
  videoQueue.push(() => runDownload(ctx, url, host, info)).catch((e) => logger.error(`video job: ${e.message}`));
}

async function runDownload(ctx, url, host, info) {
  const dir = path.join(config.tmpDir, `yb-vid-${Date.now().toString(36)}`);
  const edit = (t) => safeEdit(ctx, info, t);
  try {
    fs.mkdirSync(dir, { recursive: true });

    let meta = {};
    try {
      const { stdout } = await p('yt-dlp', [...commonArgs(), '-J', url], { timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
      meta = JSON.parse(stdout);
    } catch (e) {
      // info gagal → tetap coba download (beberapa situs menolak -J)
      logger.warn(`yt-dlp info gagal (${host}): ${e.message.split('\n')[0]}`);
    }
    const title = meta.title || 'video';
    const src = meta.extractor_key || host;
    await edit(
      [
        `🎬 “${esc(title).slice(0, 90)}”`,
        `📡 Sumber: ${src}${meta.duration ? ` • ⏱️ ${fmtDur(meta.duration)}` : ''}`,
        '',
        '⏳ Mengunduh kualitas terbaik (≤720p)…',
      ].join('\n'),
    );

    const dlArgs = [
      ...commonArgs(),
      '-f', 'bv*[height<=720]+ba/b[height<=720]/b',
      '--merge-output-format', 'mp4',
      '-o', path.join(dir, 'video.%(ext)s'),
    ];
    await p('yt-dlp', [...dlArgs, url], { timeout: 10 * 60000, maxBuffer: 10 * 1024 * 1024 });

    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith('video.'))
      .map((f) => ({ f, s: fs.statSync(path.join(dir, f)).size }))
      .sort((a, b) => b.s - a.s);
    if (!files.length) throw new Error('file hasil unduhan tidak ditemukan');
    const fp = path.join(dir, files[0].f);
    const size = files[0].s;

    if (size > config.maxVideoMb * 1048576) {
      let link = '';
      try {
        const r = await p('yt-dlp', [...commonArgs(), '-g', url], { timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
        link = r.stdout.split('\n')[0].trim();
      } catch { /* abaikan */ }
      bump('videosFail');
      logger.warn(`video terlalu besar (${fmtBytes(size)}) dari ${host}`);
      return edit(
        [
          `🐘 Videonya ${fmtBytes(size)} — melebihi batas kirim Telegram (${config.maxVideoMb}MB).`,
          link ? `\n🔗 Link unduhan langsung:\n${link}` : '',
          link ? '' : '\nCoba link lain atau kualitas lebih rendah ya.',
        ].filter(Boolean).join('\n'),
      );
    }

    bump('videos');
    const u = getUser(ctx.from.id);
    if (u) {
      u.counts = u.counts || {};
      u.counts.videos = (u.counts.videos || 0) + 1;
      users()[ctx.from.id] = u;
    }

    await edit('📤 Mengunggah ke Telegram…');
    await ctx.replyWithDocument(new InputFile(fp, `${sanitizeFilename(title)}.mp4`), {
      caption: [
        `🎬 ${title.slice(0, 120)}`,
        `📡 ${src} • ⏱️ ${meta.duration ? fmtDur(meta.duration) : '?'} • ⚖️ ${fmtBytes(size)}`,
        '',
        `⚡ ${config.brand}`,
      ].join('\n'),
    });
    logger.success(`Video ${fmtBytes(size)} terkirim ke user ${ctx.from.id} (sumber: ${host})`);
  } catch (e) {
    bump('videosFail');
    logger.error(`download video dari ${host} gagal: ${e.message.split('\n')[0]}`);
    await edit(
      [
        '😢 Gagal mengunduh video ini.',
        `Alasan: ${esc(String(e.message).split('\n')[0].slice(0, 200))}`,
        '',
        'Kemungkinan situsnya memblokir IP server (sering terjadi di TikTok/Instagram)',
        'atau link tidak didukung. Coba link lain ya. 🙏',
      ].join('\n'),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
