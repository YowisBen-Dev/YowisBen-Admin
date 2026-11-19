// Logger sederhana dengan ring buffer + subscriber SSE untuk web admin.
const buffer = [];
const subs = new Set();
const MAX = 1500;

export function log(level, msg) {
  const e = { ts: Date.now(), level, msg: String(msg).slice(0, 2000) };
  buffer.push(e);
  if (buffer.length > MAX) buffer.shift();
  console.log(`[${new Date(e.ts).toISOString()}] [${level}] ${e.msg}`);
  for (const fn of subs) {
    try { fn(e); } catch { /* subscriber mati, abaikan */ }
  }
  return e;
}

export const info = (m) => log('info', m);
export const success = (m) => log('success', m);
export const warn = (m) => log('warn', m);
export const error = (m) => log('error', m);

export function recent({ limit = 300, level = '', q = '' } = {}) {
  let rows = buffer.slice(-Math.max(1, Math.min(limit, MAX)));
  if (level) rows = rows.filter((r) => r.level === level);
  if (q) rows = rows.filter((r) => r.msg.toLowerCase().includes(String(q).toLowerCase()));
  return rows;
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function clearLogs() {
  buffer.length = 0;
}
