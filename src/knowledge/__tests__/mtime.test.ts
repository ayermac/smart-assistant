import { describe, expect, it } from "vitest";
import { getStoredMtimeMs, isUsableStoredMtime } from "../vector-store.js";

describe("mtime compatibility helpers", () => {
  it("prefers lastModifiedMs when present", () => {
    expect(getStoredMtimeMs(1765224000123, 1765224000)).toBe(1765224000123);
  });

  it("accepts short-lived Float64 lastModified values that stored milliseconds", () => {
    expect(getStoredMtimeMs(undefined, 1765224000123)).toBe(1765224000123);
  });

  it("rejects old Int32-truncated millisecond timestamps", () => {
    expect(getStoredMtimeMs(undefined, 1765224000)).toBe(0);
    expect(isUsableStoredMtime(1765224000, 1765224000123)).toBe(false);
  });

  it("accepts current millisecond timestamps with small future tolerance", () => {
    expect(isUsableStoredMtime(1765224000123, 1765224000123)).toBe(true);
    expect(isUsableStoredMtime(1765224010123, 1765224000123)).toBe(true);
  });

  it("rejects non-finite and far-future timestamps", () => {
    expect(getStoredMtimeMs(Number.POSITIVE_INFINITY, undefined)).toBe(0);
    expect(isUsableStoredMtime(Number.POSITIVE_INFINITY, 1765224000123)).toBe(false);
    expect(isUsableStoredMtime(1765224100123, 1765224000123)).toBe(false);
  });
});
