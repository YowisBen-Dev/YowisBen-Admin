import { getJSON } from '../../store.js';
import { config } from '../../config.js';
import { stats, users } from '../users.js';

export function buildMenuKeyboard() {
  const f = getJSON('features', { builtin: [], custom: [] });
  const rows = [];
  const on = (list) => (list || []).filter((x) => x.enabled);

  if (on(f.builtin).some((x) => x.id === 'apk')) {
    rows.push([{ text: '🚀 Deploy APK Flutter', callback_data: 'menu:apk' }]);
  }
  if (on(f.builtin).some((x) => x.id === 'web')) {
    rows.push([{ text: '🌐 Deploy Website', callback_data: 'menu:web' }]);
  }
  for (const c of on(f.custom).filter((x) => x.addToMenu)) {
    rows.push([{ text: `${c.icon || '✨'} ${c.name}`, callback_data: `c:${c.id}` }]);
  }
  rows.push([
    { text: '📊 Status Saya', callback_data: 'menu:status' },
    { text: 'ℹ️ Bantuan', callback_data: 'menu:help' },
  ]);
  return rows;
}

export function menuText(name) {
  return [
    `🏠 Menu Utama — ${config.brand}`,
    '',
    `Halo ${name}! Mau ngapain hari ini? Pilih fitur di bawah ya.`,
    '',
    '📥 Mau download video? Gak perlu lewat menu —',
    'langsung kirim aja link-nya ke sini, otomatis kuproses. 😎',
  ].join('\n');
}

export function statusText(user) {
  if (!user) return 'Hmm, datamu belum kecatat. Coba kirim /start dulu ya.';
  const c = user.counts || {};
  const sejak = user.verifiedAt ? new Date(user.verifiedAt).toLocaleDateString('id-ID') : '-';
  return [
    `📊 Status akun kamu — ${config.brand}`,
    '',
    `🪪 Nama: ${user.name}`,
    `✅ Verifikasi: ${user.verified ? `lulus (${user.verifyMethod === 'ai' ? 'dicek AI' : user.verifyMethod === 'manual' ? 'dicek tim' : 'web admin'}), sejak ${sejak}` : 'belum — follow channel dulu ya'}`,
    `🚀 Build APK: ${c.builds || 0}x`,
    `📥 Video diunduh: ${c.videos || 0}x`,
    `🌐 Website dideploy: ${c.sites || 0}x`,
    '',
    'Ketik /menu untuk kembali ke menu utama.',
  ].join('\n');
}

export function helpText() {
  return [
    `ℹ️ Bantuan — ${config.brand}`,
    '',
    'Perintah yang bisa dipakai:',
    '/start — mulai & verifikasi',
    '/menu — menu utama',
    '/deployapk — deploy proyek Flutter jadi APK',
    '/deployweb — hosting website .html / .zip',
    '/video <link> — download video (atau tempel link langsung)',
    '/status — statistik akun kamu',
    '/batal — batalkan mode yang lagi aktif',
    '',
    'Download video mendukung YouTube, TikTok, Instagram*, Facebook,',
    'Twitter/X, Pinterest, dan banyak lagi (*tergantung kebijakan situs).',
    '',
    `Butuh bantuan lebih? Follow channel kami: ${config.waChannel}`,
  ].join('\n');
}

export function adminStatsText() {
  const st = stats();
  const db = users();
  const list = Object.values(db);
  const verified = list.filter((u) => u.verified).length;
  const banned = list.filter((u) => u.banned).length;
  return [
    `🛡️ Statistik internal — ${config.brand}`,
    '',
    `👥 User: ${list.length} total • ${verified} verified • ${banned} banned`,
    `💬 Pesan masuk: ${st.messages || 0}`,
    `📸 Screenshot diterima: ${st.photos || 0}`,
    `🚀 Build APK: ${st.buildsOk || 0} sukses / ${st.buildsFail || 0} gagal`,
    `📥 Video: ${st.videos || 0} sukses / ${st.videosFail || 0} gagal`,
    `🌐 Website live: ${st.sites || 0}`,
    '',
    'Kelola lebih lanjut lewat web admin controller ya.',
  ].join('\n');
}
