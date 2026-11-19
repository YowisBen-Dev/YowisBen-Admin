// Ekstrak zip: pakai `unzip`, kalau tidak ada fallback ke python3 zipfile.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const p = promisify(execFile);

export async function extractZip(zipPath, dest) {
  try {
    await p('unzip', ['-q', '-o', zipPath, '-d', dest], { timeout: 120000 });
  } catch (e) {
    if (e.code === 'ENOENT') {
      await p('python3', ['-m', 'zipfile', '-e', zipPath, dest], { timeout: 120000 });
    } else {
      throw e;
    }
  }
}

// Buat zip dari sebuah folder (dipakai deploy website ke Netlify):
// coba perintah `zip` dulu, kalau tidak ada fallback ke python3 zipfile.
export async function createZip(srcDir, zipPath) {
  try {
    await p('zip', ['-qr', zipPath, '.'], { timeout: 120000, cwd: srcDir });
  } catch (e) {
    if (e.code === 'ENOENT') {
      await p('python3', ['-m', 'zipfile', '-c', zipPath, '.'], { timeout: 120000, cwd: srcDir });
    } else {
      throw e;
    }
  }
}
