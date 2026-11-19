// Fitur Deploy Website: user minta nama domain → kirim .html / .zip →
// langsung live di {PUBLIC_URL}/sites/<domain>/
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT, hasNetlify } from '../../config.js';
import * as logger from '../../logger.js';
import { getJSON, saveJSON } from '../../store.js';
import { createZip, extractZip } from '../../ziputil.js';
import { downloadBuffer, fmtBytes, safeEdit } from '../util.js';
import { bump, featureOn, getUser, users } from '../users.js';
import { resetSession } from '../sessions.js';

// ---- Netlify (kalau NETLIFY_API_KEY terpasang) ----
const NF_API = 'https://api.netlify.com/api/v1';

async function nfCall(pathname, opts = {}) {
  const res = await fetch(`${NF_API}${pathname}`, {
    ...opts,
    headers: { Authorization: `Bearer ${config.netlifyKey}`, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`Netlify ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

async function netlifyCreateSite(domain) {
  // Nama site bersifat global di Netlify → tambahkan 4 karakter acak biar aman
  let lastErr;
  for (let i = 0; i < 3; i++) {
    const name = `yb-${domain}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      return await nfCall('/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    } catch (e) {
      lastErr = e; // 422 = nama sudah dipakai, coba nama lain
    }
  }
  throw lastErr;
}

async function netlifyDeployZip(siteId, zipBuf) {
  let dep = await nfCall(`/sites/${siteId}/deploys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: zipBuf,
  });
  for (let i = 0; i < 30; i++) {
    if (dep.state === 'ready') return dep;
    if (dep.state === 'error' || dep.state === 'expired') throw new Error(`deploy Netlify gagal (${dep.state})`);
    await new Promise((r) => setTimeout(r, 3000));
    dep = await nfCall(`/deploys/${dep.id}`);
  }
  return dep;
}

export async function startWebFlow(ctx, s) {
  if (!featureOn('web')) {
    return ctx.reply('🌐 Fitur Deploy Website sedang dimatikan admin. Coba lagi nanti ya.');
  }
  s.stage = 'web_domain';
  const tujuan = hasNetlify()
    ? 'Website nanti diterbitkan otomatis ke Netlify — alamat khusus *.netlify.app langsung kukirim begitu file-nya diterima.'
    : `Nanti link-nya jadi:\n${config.publicUrl}/sites/<nama>/`;
  return ctx.reply(
    [
      '🌐 Mode Deploy Website',
      '',
      'Kasih nama domain-nya dulu ya — 3–30 karakter, huruf kecil, angka, dan tanda minus.',
      'Contoh: katalog-toko atau portofolio-aku',
      '',
      tujuan,
    ].join('\n'),
  );
}

export async function handleWebDomain(ctx, s, text) {
  const d = String(text || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(d)) {
    return ctx.reply(
      '❌ Nama domain belum valid. Pakai 3–30 karakter: huruf kecil, angka, tanda minus.\nContoh: katalog-toko',
    );
  }
  const sites = getJSON('sites', []);
  if (sites.some((x) => x.domain === d)) {
    return ctx.reply(`😵 Domain “${d}” sudah dipakai pengguna lain. Pilih nama lain ya.`);
  }
  s.data = { ...(s.data || {}), domain: d };
  s.stage = 'web_file';
  return ctx.reply(
    [
      `✅ Nama “${d}” kukunci dulu buat kamu.`,
      '',
      'Sekarang kirim file-nya:',
      '• 1 file .html → langsung dihosting, atau',
      '• .zip (proyek statis, wajib ada index.html)',
      '',
      '/batal kalau mau ganti nama.',
    ].join('\n'),
  );
}

function findIndexHtml(dir, depth = 3) {
  const direct = path.join(dir, 'index.html');
  if (fs.existsSync(direct)) return dir;
  if (depth <= 0) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return null;
  }
  for (const e of entries) {
    const found = findIndexHtml(path.join(dir, e.name), depth - 1);
    if (found) return found;
  }
  return null;
}

export async function handleWebFile(ctx, s, doc) {
  const domain = s?.data?.domain;
  if (!domain) {
    resetSession(ctx.from.id);
    return ctx.reply('🤔 Sesinya hilang. Ulangi lewat /deployweb ya.');
  }
  const name = (doc.file_name || '').toLowerCase();
  const isHtml = name.endsWith('.html') || name.endsWith('.htm');
  const isZip = name.endsWith('.zip');
  if (!isHtml && !isZip) {
    return ctx.reply('📁 Kirim file .html atau .zip ya. Format lain belum didukung. 🙂');
  }
  if (doc.file_size > config.maxUploadMb * 1048576) {
    const mb = (doc.file_size / 1048576).toFixed(1);
    return ctx.reply(`🐘 File-nya ${mb}MB — kebesaran. Maksimal ${config.maxUploadMb}MB.`);
  }

  const status = await ctx.reply(`📥 File (${fmtBytes(doc.file_size || 0)}) diterima! Mengunduh…`);
  let buf;
  try {
    const file = await ctx.getFile();
    buf = await downloadBuffer(file.file_path);
  } catch (e) {
    logger.error(`unduh web file: ${e.message}`);
    return safeEdit(ctx, status, '⚠️ Gagal mengunduh file-mu. Coba kirim ulang ya.');
  }

  await safeEdit(ctx, status, '🚀 Menerbitkan website…');
  const tmp = path.join(config.tmpDir, `yb-web-${Date.now().toString(36)}`);
  const target = path.join(ROOT, 'public', 'sites', domain);
  try {
    fs.mkdirSync(tmp, { recursive: true });
    let srcDir = tmp;
    if (isHtml) {
      fs.writeFileSync(path.join(tmp, 'index.html'), buf);
    } else {
      const zipPath = path.join(tmp, 'site.zip');
      fs.writeFileSync(zipPath, buf);
      await extractZip(zipPath, path.join(tmp, 'x'));
      const found = findIndexHtml(path.join(tmp, 'x'));
      if (!found) throw new Error('index.html tidak ditemukan di dalam zip — proyek statis wajib punya index.html');
      srcDir = found;
    }

    const sites = getJSON('sites', []);
    let url;
    let nfSite = null;

    if (hasNetlify()) {
      await safeEdit(ctx, status, '☁️ Menerbitkan ke Netlify…');
      const zipPath = path.join(tmp, 'deploy.zip');
      await createZip(srcDir, zipPath);
      const existing = sites.find((x) => x.domain === domain && x.netlifySiteId);
      nfSite = existing
        ? { id: existing.netlifySiteId, name: existing.netlifyName, ssl_url: existing.url }
        : await netlifyCreateSite(domain);
      const dep = await netlifyDeployZip(nfSite.id, fs.readFileSync(zipPath));
      if (dep.state !== 'ready') logger.warn(`netlify deploy ${dep.id} state=${dep.state}`);
      url = nfSite.ssl_url;
      logger.success(`Website “${domain}” diterbitkan ke Netlify (${nfSite.name}) oleh user ${ctx.from.id}`);
    } else {
      await safeEdit(ctx, status, '🚀 Menerbitkan website…');
      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(srcDir, target, { recursive: true });
      url = `${config.publicUrl}/sites/${domain}/`;
      logger.success(`Website “${domain}” dideploy oleh user ${ctx.from.id}`);
    }

    // satu domain = satu entri (hapus entri lama sebelum menambah yang baru)
    const idx = sites.findIndex((x) => x.domain === domain);
    if (idx >= 0) sites.splice(idx, 1);
    sites.unshift({
      domain,
      by: { id: ctx.from.id, name: ctx.from.first_name || '' },
      createdAt: Date.now(),
      ...(nfSite ? { netlifySiteId: nfSite.id, netlifyName: nfSite.name, url } : {}),
    });
    if (sites.length > 200) sites.length = 200;
    saveJSON('sites');
    bump('sites');
    const u = getUser(ctx.from.id);
    if (u) {
      u.counts = u.counts || {};
      u.counts.sites = (u.counts.sites || 0) + 1;
      users()[ctx.from.id] = u;
    }

    await safeEdit(ctx, status, '✅ Beres!');
    return ctx.reply(
      [
        '🎉 Website-mu LIVE!',
        '',
        `🔗 ${url}`,
        '',
        'Buka lewat tombol di bawah.',
        'Mau update isi? Kirim file baru di sesi yang sama dengan nama domain yang sama.',
      ].join('\n'),
      { reply_markup: { inline_keyboard: [[{ text: '🌍 Buka Website', url }]] } },
    );
  } catch (e) {
    logger.error(`deploy website gagal: ${e.message}`);
    await safeEdit(ctx, status, `💥 Deploy gagal: ${String(e.message).slice(0, 200)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    resetSession(ctx.from.id);
  }
}
