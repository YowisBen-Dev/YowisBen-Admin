/* YowisBen Dev — Bot Controller UI logic (vanilla JS, tanpa build step) */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  token: localStorage.getItem('yb_token') || '',
  status: null,
  features: null,
  users: [],
  logs: [],
  timer: null,
  sse: null,
};

/* ================= helpers ================= */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
function fmtDur(ms) {
  const s = Math.floor((ms || 0) / 1000);
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}j ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
function timeAgo(ts) {
  if (!ts) return '—';
  const d = Math.max(0, Date.now() - ts);
  const m = Math.floor(d / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}
function hhmmss(ts) {
  return new Date(ts).toLocaleTimeString('id-ID', { hour12: false });
}

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('#toast-root').appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, 3400);
}

function confirmModal({ title, body, okLabel = 'Yakin', danger = false }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal">
        <h3>${esc(title)}</h3>
        <p class="muted">${esc(body)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-a="no"><span class="btn-label">Batal</span></button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-a="yes"><span class="btn-label">${esc(okLabel)}</span></button>
        </div>
      </div>`;
    back.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a || e.target === back) {
        back.remove();
        resolve(a === 'yes');
      }
    });
    document.body.appendChild(back);
  });
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { logout(); throw new Error('sesi habis'); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}

function countUp(el, target) {
  const from = Number(el.textContent) || 0;
  if (from === target) { el.textContent = target; return; }
  const t0 = performance.now();
  const dur = 700;
  (function tick(t) {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * e);
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}

/* ripple pada semua tombol */
document.addEventListener('click', (e) => {
  const b = e.target.closest('.btn');
  if (!b) return;
  const r = b.getBoundingClientRect();
  const s = document.createElement('span');
  s.className = 'ripple';
  const size = Math.max(r.width, r.height);
  s.style.width = s.style.height = `${size}px`;
  s.style.left = `${e.clientX - r.left - size / 2}px`;
  s.style.top = `${e.clientY - r.top - size / 2}px`;
  b.appendChild(s);
  setTimeout(() => s.remove(), 650);
});

/* ================= auth ================= */
async function login(e) {
  e.preventDefault();
  const btn = $('#login-btn');
  const err = $('#login-err');
  err.textContent = '';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> <span class="btn-label">Mengautentikasi…</span>';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('#login-pass').value }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'Login gagal');
    state.token = j.token;
    localStorage.setItem('yb_token', j.token);
    enterApp();
  } catch (ex) {
    err.textContent = ex.message;
    const form = $('#login-form');
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-label">Masuk Dashboard</span>';
  }
}

function logout() {
  localStorage.removeItem('yb_token');
  state.token = '';
  if (state.sse) state.sse.close();
  if (state.timer) clearInterval(state.timer);
  $('#app').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
}

function enterApp() {
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  refreshStatus();
  loadFeatures();
  loadUsers();
  connectSSE();
  clearInterval(state.timer);
  state.timer = setInterval(refreshStatus, 8000);
  showPage(location.hash.replace('#', '') || 'dashboard');
}

/* ================= router ================= */
const PAGE_META = {
  dashboard: ['Dashboard', 'Ringkasan bot kamu hari ini'],
  features: ['Fitur Bot', 'Tambah & atur fitur — langsung aktif tanpa restart'],
  users: ['Pengguna', 'Semua yang pernah mengobrol dengan bot'],
  logs: ['Log Server', 'Live streaming aktivitas bot'],
  settings: ['Pengaturan', 'Broadcast & info server'],
};

function showPage(name) {
  if (!PAGE_META[name]) name = 'dashboard';
  $$('.page').forEach((p) => p.classList.remove('active'));
  $(`#page-${name}`)?.classList.add('active');
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === name));
  const [t, s] = PAGE_META[name];
  $('#page-title').textContent = t;
  $('#page-sub').textContent = s;
  $('#sidebar').classList.remove('open');
  $('#drawer-overlay').classList.remove('show');
  if (name === 'logs') renderTerminal();
  if (location.hash !== `#${name}`) location.hash = name;
}

/* ================= status / dashboard ================= */
const STATE_LABEL = {
  running: ['Berjalan', 'running'],
  stopped: ['Mati', 'stopped'],
  error: ['Error', 'error'],
  starting: ['Menyalakan…', 'starting'],
};

function refreshStatus() {
  return api('/api/status').then(renderStatus).catch(() => {});
}

function renderStatus(st) {
  state.status = st;
  const [label, cls] = STATE_LABEL[st.state] || [st.state, 'stopped'];
  $('#status-text').textContent = label;
  $('#status-pill').querySelector('.dot').className = `dot ${cls}`;
  $('#side-state').textContent = `Bot: ${label}`;
  $('#side-dot').className = `dot ${cls}`;
  $('#uptime-pill').textContent = st.state === 'running' ? `⏱ ${fmtDur(st.uptime)}` : '⏱ —';

  countUp($('#st-users'), st.usersSummary?.total || 0);
  countUp($('#st-verified'), st.usersSummary?.verified || 0);
  countUp($('#st-builds'), st.stats?.buildsOk || 0);
  countUp($('#st-videos'), st.stats?.videos || 0);
  countUp($('#st-sites'), st.stats?.sites || 0);

  const errBox = $('#bot-err');
  if (st.state === 'error' && st.lastError) {
    errBox.textContent = `⚠️ ${st.lastError}`;
    errBox.classList.remove('hidden');
  } else {
    errBox.classList.add('hidden');
  }

  const username = st.botUsername ? `@${st.botUsername}` : 'belum connect';
  $('#bot-meta').innerHTML =
    `🤖 <b>${esc(username)}</b> • mode long polling • antrian: ${st.queues?.apk || 0} build, ${st.queues?.video || 0} video<br>` +
    `🧠 RAM: ${fmtBytes(st.memory)} • v${esc(st.version)} • server ${fmtDur(st.serverUptime)}`;

  const check = (ok) => ok ? '✅' : '❌';
  $('#cfg-list').innerHTML = [
    [st.hasToken, 'BOT_TOKEN terisi'],
    [st.hasFlutter, 'Flutter builder tersedia (build APK)'],
    [st.hasAI, 'AI aktif (verifikasi otomatis & fitur AI)'],
    st.hasNetlify
      ? [true, 'Netlify aktif — website user live di *.netlify.app']
      : [true, `Hosting web lokal: ${st.publicUrl}/sites/<nama>`],
    [Boolean(st.publicUrl && !st.publicUrl.includes('localhost')), `PUBLIC_URL: ${st.publicUrl}`],
  ].map(([ok, label]) => `<li>${check(ok)} ${esc(label)}</li>`).join('');

  const hour = new Date().getHours();
  const salute = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
  $('#greet-text').textContent = `${salute}, Boss 🫡`;
}

/* ================= bot controls ================= */
async function botAction(action, confirmOpts) {
  if (confirmOpts && !(await confirmModal(confirmOpts))) return;
  try {
    const r = await api(`/api/bot/${action}`, { method: 'POST' });
    const [label] = STATE_LABEL[r.state] || [r.state];
    toast(`Bot: ${label}`, r.state === 'running' ? 'ok' : 'warn');
    renderStatus(r);
  } catch (e) {
    toast(e.message, 'err');
  }
}

/* ================= features ================= */
async function loadFeatures() {
  try {
    state.features = await api('/api/features');
    renderFeatures();
  } catch { /* diamkan */ }
}

function renderFeatures() {
  const f = state.features;
  if (!f) return;
  $('#builtin-grid').innerHTML = (f.builtin || []).map((x) => `
    <div class="card feat-card">
      <div class="feat-top">
        <div class="feat-emoji">${esc(x.icon)}</div>
        <strong>${esc(x.name)}</strong>
      </div>
      <p>${esc(x.desc)}</p>
      <div class="feat-foot">
        <span class="badge ${x.enabled ? 'ok' : 'ban'}">${x.enabled ? 'aktif' : 'mati'}</span>
        <label class="switch" title="on/off">
          <input type="checkbox" data-toggle="${esc(x.id)}" ${x.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>
    </div>`).join('');

  const custom = f.custom || [];
  $('#custom-list').innerHTML = custom.length ? `
    <div class="table-scroll"><table>
      <thead><tr><th>Fitur</th><th>Pemicu</th><th>Mode</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>${custom.map((x) => `
        <tr>
          <td>${esc(x.icon)} <b>${esc(x.name)}</b>${x.addToMenu ? ' <span class="badge info">di menu</span>' : ''}</td>
          <td><code>${esc(x.trigger)}</code><br><small class="muted">${esc(x.type)}</small></td>
          <td>${x.replyType === 'ai' ? '🤖 AI' : '💬 teks'}</td>
          <td><span class="badge ${x.enabled ? 'ok' : 'ban'}">${x.enabled ? 'aktif' : 'mati'}</span></td>
          <td><div class="row-actions">
            <button class="btn btn-ghost sm" data-edit="${esc(x.id)}"><span class="btn-label">✏️</span></button>
            <button class="btn btn-ghost sm" data-del="${esc(x.id)}"><span class="btn-label">🗑️</span></button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`
    : '<p style="padding:1.2rem" class="muted">Belum ada fitur custom. Klik “＋ Tambah Fitur” untuk membuat yang pertama — misalnya /harga atau /faq. Fitur langsung hidup tanpa restart bot. 😉</p>';
}

function featureModal(existing) {
  const x = existing || {};
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal">
      <h3>${existing ? '✏️ Edit Fitur' : '✨ Fitur Baru'}</h3>
      <p class="muted">Fitur ini langsung hidup di bot tanpa perlu restart.</p>
      <label class="f-label">Nama fitur</label>
      <input class="input" id="f-name" placeholder="Contoh: Cek Harga" value="${esc(x.name || '')}">
      <label class="f-label">Ikon (emoji)</label>
      <input class="input" id="f-icon" placeholder="✨" value="${esc(x.icon || '✨')}" maxlength="4">
      <label class="f-label">Tipe pemicu</label>
      <select class="input" id="f-type">
        <option value="command" ${x.type === 'command' ? 'selected' : ''}>Perintah (/namafitur)</option>
        <option value="keyword" ${x.type === 'keyword' ? 'selected' : ''}>Kata kunci (balas kalau pesan mengandung…)</option>
        <option value="regex" ${x.type === 'regex' ? 'selected' : ''}>Regex (untuk yang jago)</option>
      </select>
      <label class="f-label">Pemicu</label>
      <input class="input" id="f-trigger" placeholder="harga" value="${esc(x.trigger || '')}">
      <label class="f-label">Mode balasan</label>
      <select class="input" id="f-replytype">
        <option value="text" ${x.replyType !== 'ai' ? 'selected' : ''}>💬 Balasan teks (statis)</option>
        <option value="ai" ${x.replyType === 'ai' ? 'selected' : ''}>🤖 AI (bot menjawab otomatis)</option>
      </select>
      <label class="f-label">Isi balasan <small>(pakai {name} untuk menyebut nama user)</small></label>
      <textarea class="input" id="f-reply" rows="3" placeholder="Halo {name}! Daftar harga kami: …">${esc(x.reply || '')}</textarea>
      <label class="f-label">Prompt AI <small>(kalau mode AI)</small></label>
      <textarea class="input" id="f-aiprompt" rows="3" placeholder="Kamu CS toko YowisBen. Jawab pertanyaan soal produk dengan ramah…">${esc(x.aiPrompt || '')}</textarea>
      <label class="chk" style="margin-top:0.8rem">
        <input type="checkbox" id="f-menu" ${x.addToMenu ? 'checked' : ''}> Tampilkan sebagai tombol di menu bot
      </label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close><span class="btn-label">Batal</span></button>
        <button class="btn btn-primary" id="f-save"><span class="btn-label">💾 Simpan</span></button>
      </div>
    </div>`;
  back.querySelector('[data-close]').addEventListener('click', () => back.remove());
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  back.querySelector('#f-save').addEventListener('click', async () => {
    const body = {
      name: back.querySelector('#f-name').value.trim(),
      icon: back.querySelector('#f-icon').value.trim() || '✨',
      type: back.querySelector('#f-type').value,
      trigger: back.querySelector('#f-trigger').value.trim(),
      replyType: back.querySelector('#f-replytype').value,
      reply: back.querySelector('#f-reply').value,
      aiPrompt: back.querySelector('#f-aiprompt').value,
      addToMenu: back.querySelector('#f-menu').checked,
    };
    try {
      if (existing) await api(`/api/features/${existing.id}`, { method: 'PUT', body });
      else await api('/api/features', { method: 'POST', body });
      toast(existing ? 'Fitur diperbarui ✨' : 'Fitur baru aktif! Coba di bot 🚀', 'ok');
      back.remove();
      loadFeatures();
    } catch (e) {
      toast(e.message, 'err');
    }
  });
  document.body.appendChild(back);
  back.querySelector('#f-name').focus();
}

/* ================= users ================= */
async function loadUsers() {
  try {
    state.users = await api('/api/users');
    renderUsers();
  } catch { /* diamkan */ }
}

function renderUsers() {
  const q = ($('#user-search').value || '').toLowerCase();
  const rows = state.users.filter((u) =>
    !q || (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q));
  $('#users-body').innerHTML = rows.length ? rows.map((u) => {
    const badge = u.banned ? '<span class="badge ban">ban</span>'
      : u.verified ? '<span class="badge ok">verified</span>'
      : '<span class="badge pend">pending</span>';
    const c = u.counts || {};
    return `
    <tr>
      <td><div class="user-cell"><span class="avatar">${esc((u.name || '?')[0].toUpperCase())}</span><b>${esc(u.name)}</b></div></td>
      <td>${u.username ? `<a class="muted" href="https://t.me/${esc(u.username)}" target="_blank" rel="noopener">@${esc(u.username)}</a>` : '<span class="muted">—</span>'}</td>
      <td>${badge}</td>
      <td>🚀 ${c.builds || 0} • 📥 ${c.videos || 0} • 🌐 ${c.sites || 0}</td>
      <td class="muted">${timeAgo(u.lastSeen)}</td>
      <td><div class="row-actions">
        ${!u.verified ? `<button class="btn btn-ghost sm" data-verify="${u.id}" title="Verifikasi manual"><span class="btn-label">✅</span></button>` : ''}
        <button class="btn ${u.banned ? 'btn-ghost' : 'btn-danger'} sm" data-ban="${u.id}" data-to="${u.banned ? '0' : '1'}"><span class="btn-label">${u.banned ? '🔓' : '🔨'}</span></button>
      </div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" style="text-align:center;padding:2rem" class="muted">Belum ada pengguna. Bilang ke teman-temanmu buat chat bot-nya 😄</td></tr>';
}

/* ================= logs ================= */
async function connectSSE() {
  if (state.sse) state.sse.close();
  // seed dulu dari buffer server, lalu lanjut streaming realtime
  try {
    const seeded = await api('/api/logs?limit=300');
    state.logs = Array.isArray(seeded) ? seeded : [];
    if ($('#page-logs').classList.contains('active')) renderTerminal();
  } catch { /* lanjut tanpa seed */ }
  state.sse = new EventSource(`/api/logs/stream?token=${encodeURIComponent(state.token)}`);
  state.sse.onmessage = (ev) => {
    try {
      const e = JSON.parse(ev.data);
      state.logs.push(e);
      if (state.logs.length > 800) state.logs.shift();
      appendLine(e);
      if ($('#page-dashboard').classList.contains('active')) pushFeed(e);
    } catch { /* diamkan */ }
  };
}

function lineHTML(e) {
  return `<div class="t-line"><span class="t-time">${hhmmss(e.ts)}</span> <span class="t-${esc(e.level)}">[${esc(e.level)}]</span> ${esc(e.msg)}</div>`;
}

function renderTerminal() {
  const filtered = filteredLogs();
  $('#terminal').innerHTML = filtered.map(lineHTML).join('') || '<div class="t-line t-time">— log masih kosong —</div>';
  if ($('#log-autoscroll').checked) $('#terminal').scrollTop = $('#terminal').scrollHeight;
}

function filteredLogs() {
  const lv = $('#log-filter').value;
  return lv ? state.logs.filter((l) => l.level === lv) : state.logs;
}

function appendLine(e) {
  if ($('#page-logs').classList.contains('active')) {
    const lv = $('#log-filter').value;
    if (!lv || e.level === lv) {
      $('#terminal').insertAdjacentHTML('beforeend', lineHTML(e));
      while ($('#terminal').children.length > 800) $('#terminal').firstChild.remove();
      if ($('#log-autoscroll').checked) $('#terminal').scrollTop = $('#terminal').scrollHeight;
    }
  }
}

function pushFeed(e) {
  const feed = $('#activity-feed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className = 'feed-item';
  el.innerHTML = `<span class="feed-time">${hhmmss(e.ts)}</span><span class="t-${esc(e.level)}">●</span><span>${esc(e.msg.slice(0, 140))}</span>`;
  feed.prepend(el);
  while (feed.children.length > 12) feed.lastChild.remove();
}

/* ================= settings ================= */
function renderServerInfo() {
  const st = state.status;
  if (!st) return;
  $('#srv-info').innerHTML = [
    ['Brand', st.brand],
    ['Versi', st.version],
    ['PUBLIC_URL', st.publicUrl],
    ['Channel WA', st.waChannel],
    ['Antrian build APK', st.queues?.apk ?? 0],
    ['Broadcast terkirim', st.stats?.broadcasts || 0],
    ['RAM dipakai', fmtBytes(st.memory)],
    ['Server hidup', fmtDur(st.serverUptime)],
  ].map(([k, v]) => `<li><span>${esc(k)}</span><span>${esc(v)}</span></li>`).join('');
}

/* ================= events ================= */
$('#login-form').addEventListener('submit', login);
$('#pass-eye').addEventListener('click', () => {
  const p = $('#login-pass');
  p.type = p.type === 'password' ? 'text' : 'password';
});
$('#logout-btn').addEventListener('click', logout);

$$('.nav-item').forEach((n) => n.addEventListener('click', (e) => {
  e.preventDefault();
  showPage(n.dataset.page);
}));
window.addEventListener('hashchange', () => showPage(location.hash.replace('#', '') || 'dashboard'));

$('#hamburger').addEventListener('click', () => {
  $('#sidebar').classList.toggle('open');
  $('#drawer-overlay').classList.toggle('show');
});
$('#drawer-overlay').addEventListener('click', () => {
  $('#sidebar').classList.remove('open');
  $('#drawer-overlay').classList.remove('show');
});

$('#btn-start').addEventListener('click', () => botAction('start'));
$('#btn-restart').addEventListener('click', () => botAction('restart', {
  title: 'Restart bot?',
  body: 'Bot akan mati sebentar lalu menyala lagi. User yang sedang di-tengah alur mungkin perlu mengulang pesannya.',
  okLabel: '🔄 Restart',
}));
$('#btn-stop').addEventListener('click', () => botAction('stop', {
  title: 'Matikan bot?',
  body: 'Bot akan offline dan tidak menanggapi user sampai kamu menyalakannya lagi.',
  okLabel: '⏹ Matikan',
  danger: true,
}));

$('#btn-add-feature').addEventListener('click', () => featureModal(null));

document.addEventListener('click', async (e) => {
  const tgl = e.target.closest('[data-toggle]');
  if (tgl) {
    try {
      await api(`/api/features/${tgl.dataset.toggle}/toggle`, { method: 'POST' });
      loadFeatures();
      toast('Status fitur diubah', 'ok');
    } catch (ex) { toast(ex.message, 'err'); }
    return;
  }
  const ed = e.target.closest('[data-edit]');
  if (ed) {
    const f = state.features?.custom?.find((x) => x.id === ed.dataset.edit);
    if (f) featureModal(f);
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    const ok = await confirmModal({ title: 'Hapus fitur?', body: 'Fitur akan hilang dari bot. Tidak bisa dibatalkan.', okLabel: '🗑️ Hapus', danger: true });
    if (!ok) return;
    try {
      await api(`/api/features/${del.dataset.del}`, { method: 'DELETE' });
      toast('Fitur dihapus', 'warn');
      loadFeatures();
    } catch (ex) { toast(ex.message, 'err'); }
    return;
  }
  const vf = e.target.closest('[data-verify]');
  if (vf) {
    try {
      await api(`/api/users/${vf.dataset.verify}/verify`, { method: 'POST' });
      toast('User diverifikasi ✅', 'ok');
      loadUsers();
    } catch (ex) { toast(ex.message, 'err'); }
    return;
  }
  const bn = e.target.closest('[data-ban]');
  if (bn) {
    const to = bn.dataset.to === '1';
    try {
      await api(`/api/users/${bn.dataset.ban}/ban`, { method: 'POST', body: { banned: to } });
      toast(to ? 'User di-ban 🔨' : 'Ban dibuka 🔓', 'warn');
      loadUsers();
    } catch (ex) { toast(ex.message, 'err'); }
  }
});

$('#user-search').addEventListener('input', renderUsers);
$('#log-filter').addEventListener('change', renderTerminal);
$('#btn-log-clear').addEventListener('click', async () => {
  await api('/api/logs/clear', { method: 'POST' }).catch(() => {});
  state.logs = [];
  renderTerminal();
});
$('#btn-log-dl').addEventListener('click', () => {
  const text = state.logs.map((l) => `[${new Date(l.ts).toISOString()}] [${l.level}] ${l.msg}`).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = 'yowisben-logs.txt';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#bc-text').addEventListener('input', () => {
  $('#bc-count').textContent = `${$('#bc-text').value.length} karakter`;
});
$('#btn-broadcast').addEventListener('click', async () => {
  const text = $('#bc-text').value.trim();
  if (!text) return toast('Pesan broadcast masih kosong', 'warn');
  const ok = await confirmModal({ title: 'Kirim broadcast?', body: `Pesan akan dikirim ke semua pengguna verified: “${text.slice(0, 80)}${text.length > 80 ? '…' : ''}”`, okLabel: '📢 Kirim' });
  if (!ok) return;
  try {
    const r = await api('/api/broadcast', { method: 'POST', body: { text } });
    toast(`Broadcast terkirim ke ${r.sent} user (${r.failed} gagal) 📢`, 'ok');
    $('#bc-text').value = '';
    $('#bc-count').textContent = '0 karakter';
  } catch (e) { toast(e.message, 'err'); }
});

/* periodik render ringan */
setInterval(() => {
  if (state.status) renderServerInfo();
  if ($('#page-users').classList.contains('active')) renderUsers();
}, 15000);

/* boot */
if (state.token) {
  api('/api/me').then(enterApp).catch(() => {});
}
