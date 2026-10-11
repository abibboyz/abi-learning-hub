/** Caps concurrent Playwright runs; extra requests queue up to `maxQueue`, then get 429. */
export class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(readonly max: number, readonly maxQueue: number) {}

  get stats() {
    return { active: this.active, queued: this.waiters.length, max: this.max, maxQueue: this.maxQueue };
  }

  tryAcquire(): Promise<() => void> | null {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve(this.releaser());
    }
    if (this.waiters.length >= this.maxQueue) return null;
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active++;
        resolve(this.releaser());
      });
    });
  }

  private releaser() {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.active--;
      const next = this.waiters.shift();
      if (next) next();
    };
  }
}
