import { describe, expect, it, vi } from "vitest";
import { AsyncOperationQueue } from "../write-queue.js";

describe("AsyncOperationQueue", () => {
  it("runs operations sequentially", async () => {
    const queue = new AsyncOperationQueue();
    const events: string[] = [];
    let releaseFirst = () => {};

    const first = queue.run(
      () =>
        new Promise<string>((resolve) => {
          events.push("first:start");
          releaseFirst = () => {
            events.push("first:end");
            resolve("first");
          };
        })
    );

    const second = queue.run(async () => {
      events.push("second:start");
      return "second";
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(["first:start"]);

    releaseFirst();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("waits for the active operation and cleans abort listeners", async () => {
    const queue = new AsyncOperationQueue();
    let releaseActive = () => {};
    const active = queue.run(
      () =>
        new Promise<void>((resolve) => {
          releaseActive = resolve;
        })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");

    const waiting = queue.wait(controller.signal);
    releaseActive();

    await expect(active).resolves.toBeUndefined();
    await expect(waiting).resolves.toBeUndefined();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("rejects wait when the signal is aborted", async () => {
    const queue = new AsyncOperationQueue();
    let releaseActive = () => {};
    const active = queue.run(
      () =>
        new Promise<void>((resolve) => {
          releaseActive = resolve;
        })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const controller = new AbortController();

    const waiting = queue.wait(controller.signal);
    controller.abort(new Error("stop waiting"));

    await expect(waiting).rejects.toThrow("stop waiting");
    releaseActive();
    await expect(active).resolves.toBeUndefined();
  });
});
