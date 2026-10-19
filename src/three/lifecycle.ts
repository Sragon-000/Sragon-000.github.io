export interface FrameScheduler {
  request: (callback: () => void) => number;
  cancel: (id: number) => void;
}
export class DemandFrames {
  private pending: number | null = null;
  private disposed = false;
  private paused = false;
  constructor(
    private scheduler: FrameScheduler,
    private draw: () => void,
  ) {}
  request() {
    if (this.disposed || this.paused || this.pending !== null) return;
    this.pending = this.scheduler.request(() => {
      this.pending = null;
      if (!this.disposed && !this.paused) this.draw();
    });
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused && this.pending !== null) {
      this.scheduler.cancel(this.pending);
      this.pending = null;
    } else if (!paused) this.request();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pending !== null) this.scheduler.cancel(this.pending);
    this.pending = null;
  }
}
export class Resources {
  private items = new Set<{ dispose(): void }>();
  track<T extends { dispose(): void }>(item: T): T {
    this.items.add(item);
    return item;
  }
  dispose() {
    for (const item of this.items) {
      try {
        item.dispose();
      } catch {
        /* continue cleaning the remaining resources */
      }
    }
    this.items.clear();
  }
}
export class SingleLease {
  private release: (() => void) | null = null;
  acquire(dispose: () => void) {
    this.release?.();
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      dispose();
      if (this.release === release) this.release = null;
    };
    this.release = release;
    return release;
  }
  clear() {
    this.release?.();
  }
}
