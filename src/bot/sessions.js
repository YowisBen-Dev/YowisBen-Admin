// Sesi percakapan per user (in-memory). Cukup untuk alur menu & upload.
const sessions = new Map();

export function getSession(id) {
  if (!sessions.has(id)) sessions.set(id, {});
  return sessions.get(id);
}

export function resetSession(id) {
  sessions.delete(id);
}
