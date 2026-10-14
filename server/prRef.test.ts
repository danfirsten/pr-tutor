import { describe, expect, it } from "vitest";
import { parsePrRef } from "./prRef.ts";

describe("parsePrRef", () => {
  it("reads a full PR URL", () => {
    expect(parsePrRef("https://github.com/acme/widgets/pull/42")).toEqual({ owner: "acme", repo: "widgets", number: 42 });
  });

  it("ignores a trailing tab path and query", () => {
    expect(parsePrRef("https://github.com/acme/widgets/pull/42/files?w=1")).toEqual({ owner: "acme", repo: "widgets", number: 42 });
  });

  it("reads owner/repo#n", () => {
    expect(parsePrRef("acme/widgets#7")).toEqual({ owner: "acme", repo: "widgets", number: 7 });
  });

  it("accepts dots, dashes and underscores in names", () => {
    expect(parsePrRef("a-b/c.d_e#1")).toEqual({ owner: "a-b", repo: "c.d_e", number: 1 });
  });

  it("rejects anything else", () => {
    expect(parsePrRef("widgets#7")).toBeNull();
    expect(parsePrRef("https://github.com/acme/widgets/issues/42")).toBeNull();
    expect(parsePrRef("acme/widgets#0")).toBeNull();
    expect(parsePrRef("")).toBeNull();
  });
});
