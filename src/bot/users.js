// Data user, statistik, dan cek fitur — semua live dari store,
// jadi perubahan dari web admin langsung ngefek tanpa restart.
import { getJSON, saveJSON } from '../store.js';

export function users() {
  return getJSON('users', {});
}

export function stats() {
  return getJSON('stats', {
    messages: 0, photos: 0, buildsOk: 0, buildsFail: 0,
    videos: 0, videosFail: 0, sites: 0, broadcasts: 0,
  });
}

export function touchUser(from) {
  const db = users();
  const u = db[from.id] || (db[from.id] = {
    id: from.id,
    name: from.first_name || 'Tanpa Nama',
    username: from.username || '',
    verified: false,
    banned: false,
    joinedAt: Date.now(),
    lastSeen: 0,
    counts: { builds: 0, videos: 0, sites: 0 },
  });
  if (from.first_name) u.name = from.first_name;
  if (from.username) u.username = from.username;
  u.lastSeen = Date.now();
  const st = stats();
  st.messages = (st.messages || 0) + 1;
  saveJSON('users');
  saveJSON('stats');
  return u;
}

export function getUser(id) {
  return users()[id];
}

export function isVerified(id) {
  const u = getUser(id);
  return Boolean(u && u.verified && !u.banned);
}

export function approveUser(id, method) {
  const u = users()[id];
  if (u) {
    u.verified = true;
    u.verifiedAt = Date.now();
    u.verifyMethod = method;
    saveJSON('users');
  }
}

export function bump(stat, n = 1) {
  const st = stats();
  st[stat] = (st[stat] || 0) + n;
  saveJSON('stats');
}

export function featureOn(id) {
  const f = getJSON('features', { builtin: [], custom: [] });
  const b = (f.builtin || []).find((x) => x.id === id);
  if (b) return Boolean(b.enabled);
  const c = (f.custom || []).find((x) => x.id === id);
  if (c) return Boolean(c.enabled);
  return false;
}
