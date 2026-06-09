import { Field, Float64, Int32, Schema, Utf8 } from "apache-arrow";
import { describe, expect, it } from "vitest";
import { hasCompatibleKnowledgeMtimeSchema } from "../vector-store.js";

describe("knowledge table schema compatibility", () => {
  it("accepts nullable Float64 mtime columns", () => {
    const schema = new Schema([
      new Field("lastModified", new Float64(), true),
      new Field("lastModifiedMs", new Float64(), true),
    ]);

    expect(hasCompatibleKnowledgeMtimeSchema(schema)).toBe(true);
  });

  it("rejects old Int32 lastModified columns", () => {
    const schema = new Schema([
      new Field("lastModified", new Int32(), true),
      new Field("lastModifiedMs", new Float64(), true),
    ]);

    expect(hasCompatibleKnowledgeMtimeSchema(schema)).toBe(false);
  });

  it("rejects non-nullable lastModifiedMs columns", () => {
    const schema = new Schema([
      new Field("lastModified", new Float64(), true),
      new Field("lastModifiedMs", new Float64(), false),
    ]);

    expect(hasCompatibleKnowledgeMtimeSchema(schema)).toBe(false);
  });

  it("rejects missing mtime columns", () => {
    const schema = new Schema([
      new Field("sourcePath", new Utf8(), false),
    ]);

    expect(hasCompatibleKnowledgeMtimeSchema(schema)).toBe(false);
  });
});
