// Penyimpanan JSON sederhana (data/ dir). Cache di memori, tulis ke disk
// dengan debounce biar tidak lambat. Di Railway, pakai Volume agar persisten.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

const cache = new Map();
const timers = new Map();

const fileOf = (name) => path.join(config.dataDir, `${name}.json`);

export function getJSON(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  let data = fallback;
  try {
    if (fs.existsSync(fileOf(name))) {
      data = JSON.parse(fs.readFileSync(fileOf(name), 'utf8'));
    }
  } catch (e) {
    console.error(`[store] gagal baca ${name}: ${e.message}`);
  }
  cache.set(name, data);
  return data;
}

export function setJSON(name, value) {
  cache.set(name, value);
  saveJSON(name);
  return value;
}

export function saveJSON(name) {
  clearTimeout(timers.get(name));
  timers.set(name, setTimeout(() => {
    try {
      fs.writeFileSync(fileOf(name), JSON.stringify(cache.get(name), null, 2));
    } catch (e) {
      console.error(`[store] gagal simpan ${name}: ${e.message}`);
    }
  }, 150));
}

export const DEFAULT_FEATURES = {
  builtin: [
    { id: 'apk', name: 'Deploy APK Flutter', icon: '🚀', desc: 'Kirim .zip proyek Flutter → terima APK siap pasang', enabled: true },
    { id: 'video', name: 'Download Video', icon: '📥', desc: 'Kirim link video dari sosmed, langsung diunduh', enabled: true },
    { id: 'web', name: 'Deploy Website', icon: '🌐', desc: 'Hosting .html / .zip dengan domain pilihanmu', enabled: true },
  ],
  custom: [],
};

export function ensureDefaults() {
  if (!getJSON('features', null)) setJSON('features', structuredClone(DEFAULT_FEATURES));
  if (!getJSON('stats', null)) setJSON('stats', {
    messages: 0, photos: 0, buildsOk: 0, buildsFail: 0,
    videos: 0, videosFail: 0, sites: 0, broadcasts: 0,
  });
}
