// Antrian tugas sederhana — build APK cuma 1 sekaligus (berat),
// download video boleh 2 paralel.
export class Queue {
  constructor(concurrency = 1) {
    this.c = Math.max(1, concurrency);
    this.active = 0;
    this.q = [];
  }

  get size() {
    return this.q.length;
  }

  push(fn) {
    return new Promise((res, rej) => {
      this.q.push({ fn, res, rej });
      this._next();
    });
  }

  _next() {
    if (this.active >= this.c || !this.q.length) return;
    const { fn, res, rej } = this.q.shift();
    this.active++;
    fn().then(res, rej).finally(() => {
      this.active--;
      this._next();
    });
  }
}

export const apkQueue = new Queue(1);
export const videoQueue = new Queue(2);
