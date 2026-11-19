# ⚡ YowisBen Dev — Bot Controller

Telegram bot + **Web Admin Controller** dalam satu server. Bot-nya bisa:
verifikasi follow channel WhatsApp via screenshot (AI vision), deploy APK
Flutter dari file `.zip`, download video semua sosmed via link, dan deploy
website `.html`/`.zip` dengan domain pilihan. Web admin-nya mengendalikan bot
dengan **Start / Restart / Stop**, bisa **menambah fitur bot baru** langsung
dari browser (hot reload, tanpa restart bot), melihat pengguna, broadcast,
dan log server live — semuanya dengan UI gelap yang elegan dan penuh animasi.

---

## ✨ Fitur

### 🤖 Bot Telegram
| Fitur | Cara pakai |
|---|---|
| **Verifikasi follow WhatsApp** | `/start` → bot minta follow channel → user kirim screenshot → AI menganalisis otomatis → menu terbuka |
| **Deploy APK Flutter** | `/deployapk` → kirim `.zip` proyek Flutter → bot build (`flutter build apk --release`) → APK + info (nama, versi, ukuran, sha256) dikirim balik |
| **Download Video** | Tempel link saja (YouTube, TikTok, IG*, FB, X, dll.) → video langsung dikirim. *tergantung kebijakan situs |
| **Deploy Website** | `/deployweb` → pilih nama domain → kirim `.html` / `.zip` → live di `PUBLIC_URL/sites/<domain>/` |
| **Fitur custom** | Dibuat admin lewat web admin: mode balasan teks atau AI |

### 🖥️ Web Admin Controller
- **Start / Restart / Stop** bot dengan konfirmasi & status live
- **Tambah / edit / hapus / on-off fitur bot** — langsung aktif tanpa restart
- Daftar pengguna: verifikasi manual, ban/unban, statistik aktivitas
- **Broadcast** ke semua pengguna verified
- **Log server live** (SSE) dengan filter level, autoscroll, unduh
- Dashboard statistik animasi, status konfigurasi server
- UI responsif (HP/tablet/desktop), animasi ripple, aurora background, toast, modal

---

## 🚀 Deploy ke Railway

### 1. Siapkan repo
Push seluruh isi folder ini ke repository GitHub kamu (root repo harus berisi
`package.json` dan `Dockerfile`).

### 2. Buat project di Railway
1. Buka [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pilih repo kamu.
2. Railway otomatis mendeteksi `Dockerfile` dan membangun image.

> **Pilih Dockerfile yang sesuai:**
> - `Dockerfile` (default, **lengkap**): ada Flutter + Android SDK + yt-dlp.
>   Semua fitur jalan. Image besar (~7 GB) & build pertama agak lama —
>   ini normal, tunggu saja.
> - `Dockerfile.light` (**ringan**): tanpa Flutter. Fitur web admin, download
>   video, deploy website, dan fitur custom tetap jalan; hanya "Deploy APK
>   Flutter" yang nonaktif (bot bilang builder tidak tersedia).
>   Untuk memakainya: rename `Dockerfile` → `Dockerfile.full`, lalu
>   `Dockerfile.light` → `Dockerfile`, deploy ulang.

### 3. Set Variables
Buka tab **Variables**, minimal isi:

| Variable | Wajib? | Keterangan |
|---|---|---|
| `BOT_TOKEN` | ✅ | Token dari [@BotFather](https://t.me/BotFather) (`/newbot` → salin token) |
| `ADMIN_PASSWORD` | ✅ | Password login web admin — **wajib diganti** |
| `PUBLIC_URL` | ✅ | Domain Railway, contoh `https://yowisben.up.railway.app` (dipakai untuk link website hasil deploy) |
| `SESSION_SECRET` | ⭕ | String acak panjang — biar login tidak hangus saat restart |
| `TELEGRAM_ADMIN_ID` | ⭕ | ID Telegram kamu (verifikasi manual & `/stats`). Cari via @userinfobot |
| `AI_API_KEY` | ⭕ | Kunci API AI kompatibel OpenAI — **butuh ini kalau mau verifikasi screenshot otomatis**. Bisa OpenAI, Groq, z.ai GLM-4V, dll. |
| `AI_BASE_URL` | ⭕ | Default `https://api.openai.com/v1` (ganti sesuai provider) |
| `AI_MODEL` / `AI_VISION_MODEL` | ⭕ | Default `gpt-4o-mini` (vision butuh model yang bisa lihat gambar) |
| `MAX_VIDEO_MB` | ⭕ | Default `48` (batas Telegram 50MB) |
| `BUILD_TIMEOUT_MIN` | ⭕ | Default `30` |

### 4. Tambah Volume (disarankan)
Data user, fitur, dan website hasil deploy disimpan di file. Railway **ephemeral**
(restart = data hilang) kecuali pakai Volume:
- Tab service → **Volumes** → Add Volume → mount path `/data`.
- Bot otomatis memakai `/data` karena variable `RAILWAY_VOLUME_MOUNT`.

### 5. Buka!
- Web admin: `https://<domain-railway>` → login pakai `ADMIN_PASSWORD`.
- Bot: chat Telegram bot kamu → `/start` → follow channel → kirim screenshot → menu terbuka.
- Website hasil deploy user live di `https://<domain-railway>/sites/<nama>/`.

---

## 🔐 Catatan verifikasi screenshot
- **Kalau `AI_API_KEY` diisi** → screenshot dianalisis AI vision: dicari bukti
  status *Following/Mengikuti* pada channel WhatsApp. Hasilnya JSON
  `{mengikuti: true/false, alasan}`.
- **Kalau tidak ada AI tapi `TELEGRAM_ADMIN_ID` diisi** → screenshot diteruskan
  ke akun admin di Telegram dengan tombol ✅ Setujui / ❌ Tolak.
- **Kalau dua-duanya kosong** → user diminta menunggu; admin bisa verifikasi
  manual lewat web admin (tab Pengguna).
- Channel-nya bisa diganti lewat variable `WA_CHANNEL`.

## ⚠️ Batasan yang perlu tahu
- Telegram bot API: upload file **maksimal 50MB** (APK/video), dan unduhan
  file dari user **maksimal 20MB** (zip proyek). Batas aman, sudah dijaga bot.
- Build APK berat: butuh **RAM ≥ 4GB** di Railway (plan developer/pro).
  Build diproses satu per satu (ada antrian).
- yt-dlp dijalankan dari IP datacenter; beberapa situs (terutama Instagram &
  TikTok) kadang memblokir — bot akan memberi pesan gagal yang jelas.
  Untuk YouTube yang minta verifikasi, sediakan `cookies.txt` dan isi
  `YTDLP_COOKIES=/app/cookies.txt` (masukkan file-nya ke repo).
- `PUBLIC_URL` harus domain publik, kalau masih `localhost` link website yang
  dikirim bot tidak bisa dibuka orang lain.

## 🗂️ Struktur
```
├── Dockerfile / Dockerfile.light   # dua pilihan image (lengkap / ringan)
├── src/
│   ├── index.js                    # entry: web + bot
│   ├── config.js                   # baca environment variables
│   ├── server/app.js               # API admin + hosting /sites/*
│   ├── bot/
│   │   ├── manager.js              # start / stop / restart bot
│   │   ├── bot.js                  # router pesan
│   │   └── flows/                  # verify, apk, video, webdeploy, menu, custom
│   ├── ai.js                       # klien AI (chat + vision)
│   ├── store.js logger.js queue.js ziputil.js
└── public/                         # web admin (HTML/CSS/JS, tanpa build step)
    └── sites/                      # website hasil deploy user
```

## 🧪 Menjalankan lokal (opsional)
```bash
npm install
cp .env.example .env   # isi BOT_TOKEN dulu
npm start              # http://localhost:3000
```
Untuk fitur build APK di lokal, `flutter` harus ada di PATH.

Dibuat oleh **YowisBen Dev** ☕⚡
