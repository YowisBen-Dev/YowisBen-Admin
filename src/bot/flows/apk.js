// Fitur Deploy APK Flutter:
// user kirim .zip proyek Flutter → unzip → flutter pub get →
// flutter build apk --release → kirim APK + info ke user.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { InputFile } from 'grammy';
import { config } from '../../config.js';
import * as logger from '../../logger.js';
import { getJSON, saveJSON } from '../../store.js';
import { apkQueue } from '../../queue.js';
import { extractZip } from '../../ziputil.js';
import { downloadBuffer, esc, fmtBytes, safeEdit, sanitizeFilename } from '../util.js';
import { bump, featureOn, getUser, users } from '../users.js';
import { resetSession } from '../sessions.js';

function recordBuild(entry) {
  const builds = getJSON('builds', []);
  builds.unshift(entry);
  if (builds.length > 100) builds.length = 100;
  saveJSON('builds');
}

export async function startApkFlow(ctx, s) {
  if (!featureOn('apk')) {
    return ctx.reply('🚀 Fitur Deploy APK sedang dimatikan admin. Coba lagi nanti ya.');
  }
  if (!config.hasFlutter) {
    return ctx.reply(
      [
        '⚙️ Builder Flutter belum terpasang di server ini.',
        '',
        'Admin perlu deploy pakai Dockerfile lengkap (yang ada Flutter + Android SDK),',
        'bukan Dockerfile.light. Detailnya ada di README bagian Deploy Railway.',
      ].join('\n'),
    );
  }
  s.stage = 'apk_file';
  return ctx.reply(
    [
      '🚀 Mode Deploy APK Flutter',
      '',
      'Kirim file .zip proyek Flutter kamu (struktur lengkap, wajib ada pubspec.yaml).',
      `Batas ukuran: ${config.maxUploadMb}MB (limit API Telegram untuk bot).`,
      '',
      '💡 Tips: zip isi folder proyek (sejajar dengan pubspec.yaml),',
      'biar strukturnya langsung kebaca, bukan folder pembungkusnya.',
      '',
      'Ketik /batal kalau berubah pikiran.',
    ].join('\n'),
  );
}

export async function handleApkZip(ctx, s, doc) {
  if (!doc.file_name || !doc.file_name.toLowerCase().endsWith('.zip')) {
    return ctx.reply('📁 Formatnya harus .zip ya. Kirim ulang file zip proyek Flutter-nya. 🙂');
  }
  const mb = doc.file_size ? (doc.file_size / 1048576).toFixed(1) : '?';
  if (doc.file_size > config.maxUploadMb * 1048576) {
    return ctx.reply(`🐘 File-nya ${mb}MB — kebesaran. Maksimal ${config.maxUploadMb}MB (batas Telegram untuk bot).`);
  }

  const status = await ctx.reply(`📥 Zip (${mb}MB) diterima! Mengunduh dari Telegram…`);
  let buf;
  try {
    const file = await ctx.getFile();
    buf = await downloadBuffer(file.file_path);
  } catch (e) {
    logger.error(`unduh zip apk: ${e.message}`);
    return safeEdit(ctx, status, '⚠️ Gagal mengunduh file-mu dari Telegram. Coba kirim ulang ya.');
  }

  const pos = apkQueue.size;
  if (pos > 0) {
    await safeEdit(ctx, status, `⏳ Ada ${pos} build di depanmu. Santai, giliranmu pasti sampai. ☕`);
  }
  apkQueue.push(() => runBuild(ctx, buf, status)).catch((e) => logger.error(`apk job: ${e.message}`));
}

function findProjectRoot(base, depth = 3) {
  if (fs.existsSync(path.join(base, 'pubspec.yaml'))) return base;
  if (depth <= 0) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return null;
  }
  for (const d of entries) {
    const found = findProjectRoot(path.join(base, d.name), depth - 1);
    if (found) return found;
  }
  return null;
}

function readPubspec(file) {  const txt = fs.readFileSync(file, 'utf8');
  const name = txt.match(/^name:\s*["']?([\w\-\.]+)["']?\s*$/m)?.[1] || 'flutter_app';
  const version = txt.match(/^version:\s*["']?([\w\-\.\+]+)["']?\s*$/m)?.[1] || '1.0.0';
  const description = txt.match(/^description:\s*(.+)$/m)?.[1]?.trim() || '';
  return { name, version, description };
}

function run(cmd, args, cwd, timeoutMs, prefix) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env } });
    let tail = '';
    const grab = (d) => {
      const s = d.toString();
      tail = (tail + s).slice(-4000);
      for (const line of s.split(/\r?\n/)) {
        const t = line.trim();
        if (t) logger.info(`${prefix} ${t}`);
      }
    };
    child.stdout.on('data', grab);
    child.stderr.on('data', grab);
    const to = setTimeout(() => {
      child.kill('SIGKILL');
      const err = new Error(`${cmd} melebihi batas waktu ${(timeoutMs / 60000).toFixed(0)} menit`);
      err.tail = tail;
      reject(err);
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(to);
      e.tail = tail;
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(to);
      if (code === 0) return resolve();
      const err = new Error(`${cmd} berhenti dengan kode ${code}`);
      err.tail = tail;
      reject(err);
    });
  });
}

async function runBuild(ctx, buf, status) {
  const started = Date.now();
  const job = `apk-${started.toString(36)}`;
  const dir = path.join(config.tmpDir, `yb-${job}`);
  const edit = (t) => safeEdit(ctx, status, t);

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.zip'), buf);
    await edit('📦 Mengekstrak proyek…');
    await extractZip(path.join(dir, 'project.zip'), path.join(dir, 'proj'));

    const root = findProjectRoot(path.join(dir, 'proj'));
    if (!root) {
      throw new Error('pubspec.yaml tidak ditemukan — yakin ini proyek Flutter? Pastikan zip berisi struktur lengkap.');
    }
    const meta = readPubspec(path.join(root, 'pubspec.yaml'));
    logger.info(`Build APK dimulai: ${meta.name} v${meta.version} (user ${ctx.from.id})`);
    await edit(
      [
        `🧾 Proyek terdeteksi: ${meta.name} v${meta.version}`,
        meta.description ? `📝 ${meta.description.slice(0, 80)}` : '',
        '',
        '⬇️ Mengunduh dependensi (flutter pub get)…',
      ].filter(Boolean).join('\n'),
    );
    await run('flutter', ['pub', 'get'], root, config.buildTimeoutMin * 60000, `[${job}]`);

    await edit('🔨 Build APK release berjalan… Ini bagian paling lama (2–10 menit tergantung proyek). Ngopi dulu ☕');
    await run('flutter', ['build', 'apk', '--release'], root, config.buildTimeoutMin * 60000, `[${job}]`);

    const apk = path.join(root, 'build', 'app', 'outputs', 'flutter-apk', 'app-release.apk');
    if (!fs.existsSync(apk)) {
      throw new Error('APK hasil build tidak ditemukan. Cek apakah proyek memakai konfigurasi build yang tidak standar.');
    }
    const stat = fs.statSync(apk);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex').slice(0, 16);
    const dur = Math.round((Date.now() - started) / 1000);
    const outName = `${sanitizeFilename(`${meta.name}-${meta.version}`)}.apk`;

    bump('buildsOk');
    recordBuild({ id: job, userId: ctx.from.id, user: ctx.from.first_name || '', apkName: meta.name, version: meta.version, size: stat.size, duration: dur, status: 'ok', ts: Date.now() });
    const u = getUser(ctx.from.id);
    if (u) {
      u.counts = u.counts || {};
      u.counts.builds = (u.counts.builds || 0) + 1;
      users()[ctx.from.id] = u;
    }
    logger.success(`APK ${meta.name} v${meta.version} (${fmtBytes(stat.size)}) selesai dibuild dalam ${dur}s`);

    await edit('🎉 Build sukses! Mengirim APK…');
    await ctx.replyWithDocument(new InputFile(apk, outName), {
      caption: [
        `🎉 ${meta.name} v${meta.version} siap dipasang!`,
        '',
        `⚖️ Ukuran: ${fmtBytes(stat.size)}`,
        `⏱️ Waktu build: ${dur}s`,
        `#️⃣ SHA256: ${sha}`,
        '',
        `Dibuat oleh ${config.brand} ⚡`,
      ].join('\n'),
    });
  } catch (e) {
    bump('buildsFail');
    recordBuild({ id: job, userId: ctx.from.id, user: ctx.from.first_name || '', apkName: '-', version: '-', size: 0, duration: 0, status: 'fail', reason: String(e.message).slice(0, 120), ts: Date.now() });
    logger.error(`build APK gagal: ${e.message}`);
    const tail = e.tail ? String(e.tail).split('\n').slice(-12).join('\n') : '';
    await edit(
      [
        '💥 Build gagal.',
        `Alasan: ${esc(e.message)}`,
        tail ? `\nLog terakhir:\n<pre>${esc(tail)}</pre>` : '',
        '\nPerbaiki error di proyekmu lalu kirim ulang zip-nya ya. 💪',
      ].filter(Boolean).join('\n'),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    resetSession(ctx.from.id);
  }
}
