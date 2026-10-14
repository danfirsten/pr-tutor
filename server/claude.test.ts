import { describe, expect, it } from "vitest";
import { ClaudeLoginError, createClaude } from "./claude.ts";
import type { Run, RunOptions } from "./run.ts";

interface Call {
  cmd: string;
  args: string[];
  options?: RunOptions;
}

function fake(reply: (call: Call) => unknown) {
  const calls: Call[] = [];
  const run: Run = async (cmd, args, options) => {
    const call = { cmd, args, options };
    calls.push(call);
    return JSON.stringify(reply(call));
  };
  return { calls, run };
}

const schema = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };

describe("claude", () => {
  it("runs the CLI headless on the subscription, isolated from the user's own config", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-should-not-leak";
    const { calls, run } = fake(() => ({ is_error: false, structured_output: { a: "hi" } }));
    const claude = createClaude({ run, cwd: "/tmp/x", model: "sonnet" });

    expect(await claude.ask({ system: "sys", prompt: "the prompt", schema })).toEqual({ a: "hi" });

    const [call] = calls;
    expect(call.cmd).toBe("claude");
    expect(call.args).toEqual(expect.arrayContaining(["-p", "--output-format", "json", "--tools", "", "--setting-sources", "", "--model", "sonnet"]));
    expect(call.args).toContain(JSON.stringify(schema));
    expect(call.args).not.toContain("--bare");
    expect(call.args).not.toContain("the prompt");
    expect(call.options?.input).toBe("the prompt");
    expect(call.options?.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(call.options?.cwd).toBe("/tmp/x");
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("turns an expired login into a ClaudeLoginError", async () => {
    const { run } = fake(() => ({ is_error: true, result: "Failed to authenticate. API Error: 401 OAuth access token has expired." }));
    await expect(createClaude({ run }).ask({ system: "", prompt: "", schema })).rejects.toBeInstanceOf(ClaudeLoginError);
  });

  it("reports other errors as plain errors", async () => {
    const { run } = fake(() => ({ is_error: true, result: "Overloaded" }));
    const error = await createClaude({ run }).ask({ system: "", prompt: "", schema }).catch((e) => e);
    expect(error).not.toBeInstanceOf(ClaudeLoginError);
    expect(error.message).toContain("Overloaded");
  });

  it("fails clearly when there's no structured output", async () => {
    const { run } = fake(() => ({ is_error: false, result: "free text" }));
    await expect(createClaude({ run }).ask({ system: "", prompt: "", schema })).rejects.toThrow(/structured/);
  });

  it("runs at most three calls at once", async () => {
    let active = 0;
    let peak = 0;
    const run: Run = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return JSON.stringify({ is_error: false, structured_output: { a: "x" } });
    };
    const claude = createClaude({ run });
    await Promise.all(Array.from({ length: 8 }, () => claude.ask({ system: "", prompt: "", schema })));
    expect(peak).toBe(3);
  });
});
