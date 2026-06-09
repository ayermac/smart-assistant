import { describe, expect, it, vi } from "vitest";
import { AsyncOperationQueue } from "../write-queue.js";

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AsyncOperationQueue", () => {
  it("runs write operations sequentially", async () => {
    const queue = new AsyncOperationQueue();
    const events: string[] = [];
    let releaseFirst = () => {};

    const first = queue.runWrite(
      () =>
        new Promise<string>((resolve) => {
          events.push("first:start");
          releaseFirst = () => {
            events.push("first:end");
            resolve("first");
          };
        })
    );

    const second = queue.runWrite(async () => {
      events.push("second:start");
      return "second";
    });

    await tick();
    expect(events).toEqual(["first:start"]);

    releaseFirst();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("allows concurrent reads", async () => {
    const queue = new AsyncOperationQueue();
    const events: string[] = [];
    const releaseReads: Array<() => void> = [];
    let activeReads = 0;

    const createRead = (label: string) =>
      queue.runRead(
        () =>
          new Promise<void>((resolve) => {
            activeReads++;
            events.push(`${label}:start`);
            releaseReads.push(() => {
              activeReads--;
              resolve();
            });
          })
      );

    const first = createRead("first");
    const second = createRead("second");

    await tick();
    expect(events).toEqual(["first:start", "second:start"]);
    expect(activeReads).toBe(2);

    releaseReads.forEach((release) => release());
    await Promise.all([first, second]);
  });

  it("blocks writes while a read is active", async () => {
    const queue = new AsyncOperationQueue();
    const events: string[] = [];
    let releaseRead = () => {};

    const read = queue.runRead(
      () =>
        new Promise<void>((resolve) => {
          events.push("read:start");
          releaseRead = () => {
            events.push("read:end");
            resolve();
          };
        })
    );

    await tick();

    const write = queue.runWrite(async () => {
      events.push("write:start");
    });

    await tick();
    expect(events).toEqual(["read:start"]);

    releaseRead();

    await expect(read).resolves.toBeUndefined();
    await expect(write).resolves.toBeUndefined();
    expect(events).toEqual(["read:start", "read:end", "write:start"]);
  });

  it("prioritizes queued writes before later reads", async () => {
    const queue = new AsyncOperationQueue();
    const events: string[] = [];
    let releaseRead = () => {};

    const activeRead = queue.runRead(
      () =>
        new Promise<void>((resolve) => {
          events.push("active-read:start");
          releaseRead = () => {
            events.push("active-read:end");
            resolve();
          };
        })
    );

    await tick();

    const queuedWrite = queue.runWrite(async () => {
      events.push("write:start");
    });

    const queuedRead = queue.runRead(async () => {
      events.push("queued-read:start");
    });

    await tick();
    expect(events).toEqual(["active-read:start"]);

    releaseRead();

    await Promise.all([activeRead, queuedWrite, queuedRead]);
    expect(events).toEqual([
      "active-read:start",
      "active-read:end",
      "write:start",
      "queued-read:start",
    ]);
  });

  it("cleans abort listeners when a queued read starts", async () => {
    const queue = new AsyncOperationQueue();
    let releaseWrite = () => {};
    const activeWrite = queue.runWrite(
      () =>
        new Promise<void>((resolve) => {
          releaseWrite = resolve;
        })
    );
    await tick();

    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");

    const read = queue.runRead(async () => undefined, controller.signal);
    releaseWrite();

    await expect(activeWrite).resolves.toBeUndefined();
    await expect(read).resolves.toBeUndefined();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("rejects queued operations when the signal is aborted", async () => {
    const queue = new AsyncOperationQueue();
    let releaseWrite = () => {};
    const activeWrite = queue.runWrite(
      () =>
        new Promise<void>((resolve) => {
          releaseWrite = resolve;
        })
    );
    await tick();

    const controller = new AbortController();
    const read = queue.runRead(async () => undefined, controller.signal);
    controller.abort(new Error("stop waiting"));

    await expect(read).rejects.toThrow("stop waiting");
    releaseWrite();
    await expect(activeWrite).resolves.toBeUndefined();
  });
});
