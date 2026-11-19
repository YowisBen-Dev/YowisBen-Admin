// Web admin controller API + hosting website hasil deploy.
import crypto from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { config, ROOT, hasAI, hasNetlify } from '../config.js';
import * as logger from '../logger.js';
import { getJSON, setJSON, saveJSON } from '../store.js';
import { apkQueue, videoQueue } from '../queue.js';
import { users, stats } from '../bot/users.js';
import * as manager from '../bot/manager.js';

const bootAt = Date.now();

// ---- token sesi (HMAC) ----
function secret() {
  return config.sessionSecret || crypto.randomBytes(32).toString('hex');
}
const SECRET = secret();
const b64u = (s) => Buffer.from(s).toString('base64url');

function signToken(payload) {
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// login rate limit sederhana
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now();
  const a = attempts.get(ip) || { n: 0, t: now };
  if (now - a.t > 60000) {
    a.n = 0;
    a.t = now;
  }
  a.n++;
  attempts.set(ip, a);
  return a.n > 8;
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token || '';
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'sesi habis, login ulang ya' });
  req.auth = payload;
  next();
}

export function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  // Website hasil deploy user → /sites/<domain>/
  app.use('/sites/:name', (req, res, next) => {
    if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(req.params.name)) {
      return res.status(404).send('404 — website tidak ditemukan');
    }
    next();
  }, express.static(path.join(ROOT, 'public', 'sites'), { index: 'index.html' }));

  // UI admin
  app.use(express.static(path.join(ROOT, 'public')));

  // ---- login ----
  app.post('/api/login', (req, res) => {
    const ip = req.ip || 'x';
    if (tooMany(ip)) return res.status(429).json({ error: 'Coba lagi dalam semenit ya (terlalu banyak percobaan).' });
    const pass = String(req.body?.password || '');
    if (!config.adminPasswords.includes(pass)) {
      logger.warn(`Login gagal dari ${ip}`);
      return res.status(401).json({ error: 'Password salah.' });
    }
    const token = signToken({ exp: Date.now() + 7 * 24 * 3600 * 1000, ip });
    logger.success('Admin masuk ke web controller');
    res.json({ token });
  });

  app.get('/api/me', auth, (req, res) => res.json({ ok: true }));

  // ---- status & kontrol bot ----
  app.get('/api/status', auth, (req, res) => {
    const st = stats();
    const list = Object.values(users());
    res.json({
      ...manager.info(),
      version: config.version,
      brand: config.brand,
      serverUptime: Date.now() - bootAt,
      memory: process.memoryUsage().rss,
      publicUrl: config.publicUrl,
      waChannel: config.waChannel,
      hasAI: hasAI(),
      hasNetlify: hasNetlify(),
      queues: { apk: apkQueue.size + apkQueue.active, video: videoQueue.size + videoQueue.active },
      stats: st,
      usersSummary: {
        total: list.length,
        verified: list.filter((u) => u.verified).length,
        banned: list.filter((u) => u.banned).length,
      },
    });
  });

  app.post('/api/bot/start', auth, async (req, res) => res.json(await manager.start()));
  app.post('/api/bot/stop', auth, async (req, res) => res.json(await manager.stop()));
  app.post('/api/bot/restart', auth, async (req, res) => res.json(await manager.restart()));

  // ---- fitur bot (hot reload) ----
  app.get('/api/features', auth, (req, res) => {
    res.json(getJSON('features', { builtin: [], custom: [] }));
  });

  app.post('/api/features', auth, (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const trigger = String(b.trigger || '').trim();
    if (!name || name.length > 40) return res.status(400).json({ error: 'Nama fitur wajib (maks 40 karakter).' });
    if (!trigger) return res.status(400).json({ error: 'Trigger wajib diisi.' });
    if (b.type === 'regex') {
      try { new RegExp(trigger, 'i'); } catch { return res.status(400).json({ error: 'Regex tidak valid.' }); }
    }
    if (b.replyType === 'ai' && !hasAI()) {
      return res.status(400).json({ error: 'Fitur AI butuh AI_API_KEY di server. Isi dulu variable-nya.' });
    }
    const f = getJSON('features', { builtin: [], custom: [] });
    f.custom = f.custom || [];
    const feat = {
      id: `c_${Date.now().toString(36)}`,
      name,
      icon: String(b.icon || '✨').slice(0, 4),
      type: ['command', 'keyword', 'regex'].includes(b.type) ? b.type : 'command',
      trigger,
      replyType: b.replyType === 'ai' ? 'ai' : 'text',
      reply: String(b.reply || '').slice(0, 4000),
      aiPrompt: String(b.aiPrompt || '').slice(0, 2000),
      addToMenu: Boolean(b.addToMenu),
      enabled: true,
    };
    f.custom.push(feat);
    saveJSON('features');
    logger.success(`Fitur baru dibuat dari web admin: "${feat.name}" (trigger: ${feat.trigger})`);
    res.json({ ok: true, feature: feat });
  });

  app.put('/api/features/:id', auth, (req, res) => {
    const f = getJSON('features', { builtin: [], custom: [] });
    const feat = (f.custom || []).find((x) => x.id === req.params.id);
    if (!feat) return res.status(404).json({ error: 'Fitur tidak ditemukan.' });
    const b = req.body || {};
    if (b.name !== undefined) feat.name = String(b.name).trim().slice(0, 40) || feat.name;
    if (b.icon !== undefined) feat.icon = String(b.icon).slice(0, 4);
    if (b.trigger !== undefined) feat.trigger = String(b.trigger).trim();
    if (b.type !== undefined && ['command', 'keyword', 'regex'].includes(b.type)) feat.type = b.type;
    if (b.replyType !== undefined) feat.replyType = b.replyType === 'ai' ? 'ai' : 'text';
    if (b.reply !== undefined) feat.reply = String(b.reply).slice(0, 4000);
    if (b.aiPrompt !== undefined) feat.aiPrompt = String(b.aiPrompt).slice(0, 2000);
    if (b.addToMenu !== undefined) feat.addToMenu = Boolean(b.addToMenu);
    if (b.enabled !== undefined) feat.enabled = Boolean(b.enabled);
    saveJSON('features');
    logger.info(`Fitur "${feat.name}" diperbarui via web admin`);
    res.json({ ok: true, feature: feat });
  });

  app.delete('/api/features/:id', auth, (req, res) => {
    const f = getJSON('features', { builtin: [], custom: [] });
    const before = (f.custom || []).length;
    f.custom = (f.custom || []).filter((x) => x.id !== req.params.id);
    if (f.custom.length === before) return res.status(404).json({ error: 'Fitur tidak ditemukan.' });
    saveJSON('features');
    logger.info(`Fitur custom dihapus via web admin (${req.params.id})`);
    res.json({ ok: true });
  });

  app.post('/api/features/:id/toggle', auth, (req, res) => {
    const f = getJSON('features', { builtin: [], custom: [] });
    const all = [...(f.builtin || []), ...(f.custom || [])];
    const feat = all.find((x) => x.id === req.params.id);
    if (!feat) return res.status(404).json({ error: 'Fitur tidak ditemukan.' });
    feat.enabled = !feat.enabled;
    saveJSON('features');
    logger.info(`Fitur "${feat.name}" ${feat.enabled ? 'diaktifkan' : 'dimatikan'} via web admin`);
    res.json({ ok: true, enabled: feat.enabled });
  });

  // ---- users ----
  app.get('/api/users', auth, (req, res) => {
    const list = Object.values(users()).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
    res.json(list.slice(0, 500));
  });

  app.post('/api/users/:id/verify', auth, (req, res) => {
    const u = users()[Number(req.params.id)];
    if (!u) return res.status(404).json({ error: 'User tidak ditemukan.' });
    u.verified = true;
    u.verifiedAt = Date.now();
    u.verifyMethod = 'web-admin';
    saveJSON('users');
    logger.success(`User ${u.name} (${u.id}) diverifikasi manual via web admin`);
    res.json({ ok: true });
  });

  app.post('/api/users/:id/ban', auth, (req, res) => {
    const u = users()[Number(req.params.id)];
    if (!u) return res.status(404).json({ error: 'User tidak ditemukan.' });
    u.banned = Boolean(req.body?.banned);
    saveJSON('users');
    logger.warn(`User ${u.name} (${u.id}) ${u.banned ? 'DI-BAN' : 'dibuka bannya'} via web admin`);
    res.json({ ok: true, banned: u.banned });
  });

  app.get('/api/builds', auth, (req, res) => {
    res.json((getJSON('builds', []) || []).slice(0, 100));
  });

  app.get('/api/sites', auth, (req, res) => {
    res.json((getJSON('sites', []) || []).slice(0, 100));
  });

  // ---- broadcast ----
  app.post('/api/broadcast', auth, async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Pesan broadcast kosong.' });
    const bot = manager.getBot();
    if (!bot || manager.info().state !== 'running') {
      return res.status(400).json({ error: 'Bot sedang tidak jalan — nyalakan dulu.' });
    }
    const targets = Object.values(users()).filter((u) => u.verified && !u.banned);
    let sent = 0;
    let failed = 0;
    for (const u of targets) {
      try {
        await bot.api.sendMessage(u.id, `📢 ${text}`);
        sent++;
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 60)); // jaga rate limit Telegram
    }
    const st = stats();
    st.broadcasts = (st.broadcasts || 0) + 1;
    saveJSON('stats');
    logger.success(`Broadcast terkirim ke ${sent} user (${failed} gagal)`);
    res.json({ ok: true, sent, failed });
  });

  // ---- logs ----
  app.get('/api/logs', auth, (req, res) => {
    res.json(logger.recent({
      limit: Number(req.query.limit) || 300,
      level: String(req.query.level || ''),
      q: String(req.query.q || ''),
    }));
  });

  app.post('/api/logs/clear', auth, (req, res) => {
    logger.clearLogs();
    res.json({ ok: true });
  });

  app.get('/api/logs/stream', auth, (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    const send = (e) => {
      try { res.write(`data: ${JSON.stringify(e)}\n\n`); } catch { /* klien tutup */ }
    };
    const unsub = logger.subscribe(send);
    const iv = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { /* diamkan */ }
    }, 20000);
    req.on('close', () => {
      clearInterval(iv);
      unsub();
    });
  });

  // 404 API rapi
  app.use('/api', (req, res) => res.status(404).json({ error: 'endpoint tidak ada' }));

  return app;
}

export { setJSON };
