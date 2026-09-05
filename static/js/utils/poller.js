// Reusable Poller class for polling async background operations

export class Poller {
  constructor(pollFn, intervalMs = 2500) {
    this.pollFn = pollFn;
    this.intervalMs = intervalMs;
    this.timerId = null;
    this.active = false;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.timerId = setInterval(async () => {
      if (!this.active) return;
      try {
        const shouldContinue = await this.pollFn();
        if (shouldContinue === false) {
          this.stop();
        }
      } catch (err) {
        console.error('Poller error:', err);
      }
    }, this.intervalMs);
  }

  stop() {
    this.active = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  isRunning() {
    return this.active;
  }
}
