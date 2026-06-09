export class AsyncOperationQueue {
  private activeReaders = 0;
  private activeWriter = false;
  private queue: Array<QueuedOperation> = [];

  get size(): number {
    return this.queue.length + this.activeReaders + (this.activeWriter ? 1 : 0);
  }

  async runRead<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire("read", signal);

    try {
      return await task();
    } finally {
      release();
    }
  }

  async runWrite<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire("write", signal);

    try {
      return await task();
    } finally {
      release();
    }
  }

  private async acquire(mode: OperationMode, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      throw createAbortError(signal);
    }

    if (this.canStartImmediately(mode)) {
      this.start(mode);
      return () => this.release(mode);
    }

    return new Promise((resolve, reject) => {
      let cleanupAbortListener = () => {};

      const request: QueuedOperation = {
        mode,
        start: () => {
          cleanupAbortListener();
          this.start(mode);
          resolve(() => this.release(mode));
        },
      };

      if (signal) {
        const onAbort = () => {
          this.queue = this.queue.filter((queued) => queued !== request);
          cleanupAbortListener();
          reject(createAbortError(signal));
        };

        cleanupAbortListener = () => signal.removeEventListener("abort", onAbort);
        signal.addEventListener("abort", onAbort, { once: true });
      }

      this.queue.push(request);
    });
  }

  private canStartImmediately(mode: OperationMode): boolean {
    if (mode === "read") {
      return !this.activeWriter && this.queue.length === 0;
    }

    return !this.activeWriter && this.activeReaders === 0 && this.queue.length === 0;
  }

  private start(mode: OperationMode): void {
    if (mode === "read") {
      this.activeReaders += 1;
      return;
    }

    this.activeWriter = true;
  }

  private release(mode: OperationMode): void {
    if (mode === "read") {
      this.activeReaders -= 1;
    } else {
      this.activeWriter = false;
    }

    this.drain();
  }

  private drain(): void {
    if (this.activeWriter || this.queue.length === 0) {
      return;
    }

    const first = this.queue[0];
    if (first.mode === "write") {
      if (this.activeReaders > 0) {
        return;
      }

      this.queue.shift();
      first.start();
      return;
    }

    while (this.queue[0]?.mode === "read") {
      const read = this.queue.shift()!;
      read.start();
    }
  }
}

type OperationMode = "read" | "write";

interface QueuedOperation {
  mode: OperationMode;
  start: () => void;
}

function createAbortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new Error("Operation aborted while waiting for queued knowledge operation");
}
