# 🚀 Deploy YowisBen Bot Controller ke Railway

Ada **2 cara**. Cara A (GitHub repo) dipakai untuk deploy pertama & update otomatis
(setiap push → Railway rebuild). Cara B (CLI) untuk deploy cepat tanpa GitHub.

---

## Metode A — Deploy dari GitHub Repo (disarankan)

### A1. Push kode ke GitHub
1. Ekstrak `yowisben-bot-controller.zip`.
2. Buat repo baru di GitHub (mis. `yowisben-bot`) — **private** agar aman.
3. Upload/push **semua isi** folder ke root repo (Dockerfile, `package.json`, folder `src/`, `public/`, dll. — jangan masukkan folder `node_modules/` dan `data/`):

```bash
cd yowisben-bot-controller
git init
git add -A
git commit -m "YowisBen Bot Controller v1.0.0"
git branch -M main
git remote add origin https://github.com/<username>/yowisben-bot.git
git push -u origin main
```

### A2. Buat project di Railway
1. Buka [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Pilih repo `yowisben-bot` (kalau repo tidak muncul → **Configure GitHub App** → beri akses ke repo itu).
3. Railway langsung mulai build pertama (pakai `Dockerfile` di root — versi LENGKAP:
   Flutter builder + yt-dlp, semua fitur jalan). Build pertama **10–25 menit** itu normal.
   Kalau kuota/RAM terbatas dan tidak butuh build APK: di service → Settings → Build →
   ganti **Dockerfile path** jadi `Dockerfile.light` lalu redeploy (ringan; semua fitur jalan
   kecuali deploy APK Flutter).

### A3. Pasang Variables (service → Variables)
```
BOT_TOKEN=<token bot dari @BotFather>
ADMIN_PASSWORD=YowisBenxDev,YowisBenxProject
SESSION_SECRET=<string acak, contoh: openssl rand -hex 24>
AI_API_KEY=<API key AI (format AQ.xxxx = Gemini, kompatibel juga OpenAI/Groq/z.ai)>
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-flash-latest
AI_VISION_MODEL=gemini-flash-latest
NETLIFY_API_KEY=<token Netlify untuk deploy website otomatis ke *.netlify.app>
PORT=3000
```
> `PUBLIC_URL` **tidak perlu** — otomatis dari `RAILWAY_PUBLIC_DOMAIN`.

### A4. Volume (biar data tidak hilang saat redeploy)
Service → **Volumes** → **Add Volume** → mount path: `/data`

### A5. Domain publik
Service → **Settings → Networking → Generate Domain** → target port `3000`.
Dapat alamat seperti `https://yowisben-bot-production.up.railway.app`.

### A6. Verifikasi
- Buka domain → login admin (`YowisBenxDev` atau `YowisBenxProject`) → Dashboard harus
  **● Berjalan** + konfigurasi ✅.
- Telegram: chat **@YowisBen_bot** → `/start` → follow channel WA → kirim screenshot →
  AI memverifikasi → menu kebuka (`/deployapk`, `/deployweb`, `/video`, `/help`).
- `/deployweb`: pilih nama → kirim `.html`/`.zip` → link `*.netlify.app` langsung LIVE.

---

## Metode B — Deploy langsung via Railway CLI (tanpa GitHub)

```bash
npm install -g @railway/cli          # atau: curl -fsSL https://railway.app/install.sh | sh
cd yowisben-bot-controller

# buat project (bisa juga lewat web dashboard)
railway init --name yowisben-bot

# pasang variables (ulangi per variable)
railway variables --set BOT_TOKEN=xxx \
  --set "ADMIN_PASSWORD=YowisBenxDev,YowisBenxProject" \
  --set SESSION_SECRET=xxx \
  --set AI_API_KEY=xxx \
  --set AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai \
  --set AI_MODEL=gemini-flash-latest \
  --set AI_VISION_MODEL=gemini-flash-latest \
  --set NETLIFY_API_KEY=xxx \
  --set PORT=3000

# volume (opsional tapi disarankan)
railway volume add --mount-path /data

# upload kode & deploy
railway up

# domain publik
railway domain
```

> Cara login CLI: `railway login` (browser) atau pakai token: `RAILWAY_TOKEN=<token> railway <perintah>`.
> Token project dibuat di project → Settings → Tokens.

---

## Update kode setelah jalan (Metode A)

```bash
git add -A && git commit -m "update" && git push
```
Railway otomatis rebuild + restart bot. Data user tetap aman di Volume `/data`.

## Bila perlu diubah
| Keperluan | Cara |
|---|---|
| Ganti password admin | Variables → `ADMIN_PASSWORD` (bisa beberapa, pisah koma) → redeploy |
| Matikan/nyalakan fitur | Web admin → **Fitur Bot** → toggle langsung aktif |
| Lihat aktivitas realtime | Web admin → **Log Server** |
| Back up data | Railway → Volume → Backups (atau unduh dari web admin → Pengguna) |
