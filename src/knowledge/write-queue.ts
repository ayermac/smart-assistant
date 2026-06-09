export class AsyncOperationQueue {
  private tail: Promise<void> = Promise.resolve();
  private pendingCount = 0;

  get size(): number {
    return this.pendingCount;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release = () => {};
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.pendingCount += 1;

    try {
      await previous.catch(() => undefined);
      return await task();
    } finally {
      this.pendingCount -= 1;
      release();
    }
  }

  async wait(signal?: AbortSignal): Promise<void> {
    if (!signal) {
      await this.tail.catch(() => undefined);
      return;
    }

    if (signal.aborted) {
      throw createAbortError(signal);
    }

    let cleanupAbortListener = () => {};

    try {
      await Promise.race([
        this.tail.catch(() => undefined),
        new Promise<never>((_, reject) => {
          const onAbort = () => {
            reject(createAbortError(signal));
          };

          cleanupAbortListener = () => signal.removeEventListener("abort", onAbort);
          signal.addEventListener("abort", onAbort, { once: true });
        }),
      ]);
    } finally {
      cleanupAbortListener();
    }
  }
}

function createAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Operation aborted while waiting for queued writes");
}
