// YowisBen Dev — entry point.
// Web admin controller + Telegram bot dalam satu proses.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from './config.js';
import * as logger from './logger.js';
import { ensureDefaults } from './store.js';
import { createServer } from './server/app.js';
import * as manager from './bot/manager.js';

const BANNER = `
  ⚡ YOWISBEN DEV — Bot Controller ⚡
  Telegram Bot + Web Admin dalam satu paket
  ------------------------------------------
  🚀 Deploy APK Flutter    📥 Download Video
  🌐 Deploy Website        🛡️ Verifikasi AI
`;

function main() {
  console.log(BANNER);
  logger.info(`${config.brand} v${config.version} — boot dimulai`);

  // folder wajib
  fs.mkdirSync(path.join(ROOT, 'public', 'sites'), { recursive: true });
  ensureDefaults();

  const port = Number(process.env.PORT || 3000);
  const app = createServer();
  const server = app.listen(port, () => {
    logger.success(`Web admin siap di port ${port} → ${config.publicUrl}`);
    logger.info(`Status konfigurasi: token=${config.token ? '✓' : '✗'} ai=${config.ai.key ? '✓' : '✗'} flutter=${config.hasFlutter ? '✓' : '✗'} adminId=${config.adminId ? '✓' : '✗'}`);
  });

  // auto-start bot kalau token sudah diisi
  if (config.token) {
    manager.start().catch((e) => logger.error(`auto-start bot gagal: ${e.message}`));
  } else {
    manager.bootLog();
  }

  const shutdown = async (sig) => {
    logger.warn(`Sinyal ${sig} diterima — matikan dengan rapi…`);
    try { await manager.stop(); } catch { /* diamkan */ }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (r) => logger.error(`unhandledRejection: ${r?.message || r}`));
  process.on('uncaughtException', (e) => logger.error(`uncaughtException: ${e?.message || e}`));
}

main();
