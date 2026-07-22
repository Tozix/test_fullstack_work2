export class Semaphore {
  private readonly capacity: number;
  private readonly waiters: Array<() => void> = [];
  private inUse = 0;

  constructor(capacity: number) {
    if (capacity < 1) throw new Error('Semaphore capacity must be >= 1');
    this.capacity = capacity;
  }

  acquire(): Promise<() => void> {
    if (this.inUse < this.capacity) {
      this.inUse += 1;
      return Promise.resolve(() => this.release());
    }
    return new Promise<() => void>((resolve) => {
      this.waiters.push(() => {
        this.inUse += 1;
        resolve(() => this.release());
      });
    });
  }

  get active(): number {
    return this.inUse;
  }

  get queued(): number {
    return this.waiters.length;
  }

  private release(): void {
    this.inUse -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
