// Alur verifikasi: wajib follow channel WhatsApp → kirim screenshot
// → dianalisis AI vision (atau diteruskan ke admin kalau AI belum diisi).
import { config } from '../../config.js';
import * as logger from '../../logger.js';
import { aiVision, extractJSON } from '../../ai.js';
import { downloadBuffer } from '../util.js';
import { approveUser, getUser } from '../users.js';
import { resetSession } from '../sessions.js';
import { buildMenuKeyboard } from './menu.js';
import { bump } from '../users.js';

function reqButtons() {
  return {
    inline_keyboard: [
      [{ text: '🔗 Buka Channel WhatsApp', url: config.waChannel }],
    ],
  };
}

export function startVerification(ctx) {
  const name = ctx.from.first_name || 'kawan';
  const text = [
    `👋 Halo ${name}! Selamat datang di ${config.brand}.`,
    '',
    'Aku bot yang siap bantu kamu:',
    '🚀 Deploy APK Flutter — kirim .zip, terima APK siap pasang',
    '📥 Download video dari berbagai sosmed lewat link',
    '🌐 Deploy website (.html / .zip) dengan domain pilihanmu',
    '',
    'Sebelum semua fitur kebuka, ada 1 syarat wajib dulu ya:',
    '',
    '1️⃣ Follow channel WhatsApp resmi kami:',
    `👉 ${config.waChannel}`,
    '',
    '2️⃣ Setelah follow, kirim screenshot bukti ke chat ini.',
    'Aku cek otomatis — biasanya cuma butuh beberapa detik. 😉',
  ].join('\n');
  return ctx.reply(text, { reply_markup: reqButtons() });
}

export function verificationReminder(ctx) {
  return ctx.reply(
    [
      '🔒 Fiturnya masih terkunci, teman. 😅',
      'Syaratnya: follow channel WhatsApp kami lalu kirim screenshot buktinya di sini.',
      `👉 ${config.waChannel}`,
    ].join('\n'),
    { reply_markup: reqButtons() },
  );
}

function successReply(ctx) {
  const name = ctx.from.first_name || 'kawan';
  return ctx.reply(
    [
      `✅ Verified! Beres, ${name} — semua fitur sekarang kebuka. 🎉`,
      '',
      'Ketik /menu atau langsung pilih tombol di bawah.',
      'Selamat berkarya! ⚡',
    ].join('\n'),
    { reply_markup: { inline_keyboard: buildMenuKeyboard() } },
  );
}

export async function handleVerificationPhoto(ctx, s) {
  const uid = ctx.from.id;
  const user = getUser(uid);

  if (user?.verified) {
    return ctx.reply('📸 Screenshot diterima! Tapi kamu kan sudah verified 😄 Ketik /menu untuk mulai.');
  }

  const sizes = ctx.message.photo || [];
  if (!sizes.length) return;
  bump('photos');

  const note = await ctx.reply('🔍 Oke, screenshot-nya kuterima. Aku periksa sebentar ya…');
  await ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});

  try {
    const file = await ctx.getFile();
    const buf = await downloadBuffer(file.file_path);

    if (config.ai.key) {
      await analyzeWithAI(ctx, uid, buf, note);
    } else if (config.adminId) {
      await forwardToAdmin(ctx, uid, note);
    } else {
      logger.warn('Verifikasi terhambat: AI_API_KEY & TELEGRAM_ADMIN_ID sama-sama kosong');
      await ctx.api.editMessageText(
        ctx.chat.id,
        note.message_id,
        [
          '⚠️ Maaf, verifikasi otomatis sedang tidak tersedia di server.',
          'Screenshot-mu sudah kusimpan — minta admin memverifikasi lewat web controller,',
          'lalu coba kirim /start lagi. 🙏',
        ].join('\n'),
      );
    }
  } catch (e) {
    logger.error(`verifikasi: ${e.message}`);
    await ctx.reply('⚠️ Ada kendala teknis saat membaca gambarmu. Coba kirim ulang ya. 📸');
  } finally {
    resetSession(uid);
  }
}

async function analyzeWithAI(ctx, uid, buf, note) {
  const prompt = [
    `Kamu moderator verifikasi untuk layanan ${config.brand}.`,
    `Pengguna Telegram mengklaim sudah follow WhatsApp Channel: ${config.waChannel}`,
    'Tugas: periksa screenshot ini dan tentukan apakah terlihat bukti bahwa pengguna SUDAH',
    'follow/mengikuti channel WhatsApp tersebut (contoh: tombol "Following"/"Mengikuti",',
    'status joined, atau halaman channel dengan tanda sudah bergabung).',
    'Screenshot yang bukan WhatsApp, blur berat, atau masih menampilkan tombol "Follow" = belum mengikuti.',
    'Balas HANYA JSON valid tanpa teks lain: {"mengikuti": true, "alasan": "maksimal 15 kata"}',
  ].join('\n');

  let verdict = null;
  try {
    const out = await aiVision(buf.toString('base64'), 'image/jpeg', prompt);
    verdict = extractJSON(out);
  } catch (e) {
    logger.error(`AI vision gagal: ${e.message}`);
  }

  if (verdict && typeof verdict.mengikuti === 'boolean') {
    if (verdict.mengikuti) {
      approveUser(uid, 'ai');
      logger.success(`User ${uid} verified via AI vision`);
      await ctx.api.editMessageText(ctx.chat.id, note.message_id, '✅ Screenshot valid — aku temukan bukti follow-nya!');
      return successReply(ctx);
    }
    const alasan = verdict.alasan || 'screenshot tidak menunjukkan bukti follow';
    return ctx.api.editMessageText(
      ctx.chat.id,
      note.message_id,
      [
        `❌ Belum bisa kuterima. Alasan: ${alasan}.`,
        '',
        'Cek lagi ya: buka channel-nya, tekan Follow sampai tombolnya berubah jadi "Following",',
        'lalu screenshot halaman itu dan kirim ulang ke sini. 📸',
      ].join('\n'),
    );
  }

  // AI jawabannya tidak bisa diparse → jatuh ke jalur manual kalau admin ada
  if (config.adminId) return forwardToAdmin(ctx, uid, note);
  return ctx.api.editMessageText(
    ctx.chat.id,
    note.message_id,
    '🤔 AI belum yakin dengan screenshot ini. Coba kirim ulang yang lebih jelas ya — buka halaman channel-nya langsung, jangan cuma notifikasi. 📸',
  );
}

async function forwardToAdmin(ctx, uid, note) {
  const u = getUser(uid);
  await ctx.api.forwardMessage(config.adminId, ctx.chat.id, ctx.message.message_id).catch(() => {});
  await ctx.api.sendMessage(
    config.adminId,
    `🛡️ Verifikasi manual untuk ${u?.name || 'user'} (id ${uid}).\nSetujui verifikasinya?`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Setujui', callback_data: `v:ok:${uid}` },
          { text: '❌ Tolak', callback_data: `v:no:${uid}` },
        ]],
      },
    },
  ).catch(() => {});
  logger.info(`Screenshot user ${uid} diteruskan ke admin untuk verifikasi manual`);
  await ctx.api.editMessageText(
    ctx.chat.id,
    note.message_id,
    '📮 Screenshot-mu kuteruskan ke tim untuk dicek manual. Biasanya cepat kok — tunggu sebentar ya. ☕',
  );
}

export async function handleManualVerifyCallback(ctx, data) {
  if (String(ctx.from.id) !== String(config.adminId || '')) {
    return; // bukan admin, abaikan
  }
  const ok = data.startsWith('v:ok:');
  const uid = Number(data.slice(5));
  if (!uid) return;

  if (ok) {
    approveUser(uid, 'manual');
    logger.success(`Admin memverifikasi user ${uid} secara manual`);
    await ctx.api.editMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, '✅ Disetujui — user sudah diverifikasi.').catch(() => {});
    await ctx.api.sendMessage(uid, '🛡️ Tim memverifikasi akunmu secara manual — selamat, kamu resmi jadi anggota! 🎉').catch(() => {});
  } else {
    await ctx.api.editMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, '❌ Ditolak — user diminta mengirim ulang screenshot.').catch(() => {});
    await ctx.api.sendMessage(
      uid,
      '🛡️ Tim menilai screenshot-mu belum cukup sebagai bukti follow.\nCoba screenshot ulang halaman channel-nya sampai terlihat status "Following", lalu kirim di sini ya. 📸',
    ).catch(() => {});
  }
}
