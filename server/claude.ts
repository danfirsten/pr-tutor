import { CommandError, run as defaultRun, type Run } from "./run.ts";

export class ClaudeLoginError extends Error {
  constructor() {
    super("Claude Code isn't signed in, or its login has expired. Run `claude` in a terminal and use /login, then retry.");
  }
}

export interface Ask {
  system: string;
  prompt: string;
  schema: object;
}

interface CliResult {
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
}

const LOGIN_PROBLEM = /authenticat|oauth|log ?in|401|invalid api key|credit balance/i;
const MAX_AT_ONCE = 3;

export type Claude = ReturnType<typeof createClaude>;

export function createClaude({ run = defaultRun, cwd, model = "sonnet", timeoutMs = 180_000 }: { run?: Run; cwd?: string; model?: string; timeoutMs?: number } = {}) {
  let active = 0;
  const waiting: Array<() => void> = [];

  async function slot<T>(work: () => Promise<T>): Promise<T> {
    if (active >= MAX_AT_ONCE) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await work();
    } finally {
      active--;
      waiting.shift()?.();
    }
  }

  async function ask<T>({ system, prompt, schema }: Ask): Promise<T> {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const args = [
      "-p",
      "--output-format", "json",
      "--json-schema", JSON.stringify(schema),
      "--system-prompt", system,
      "--model", model,
      "--tools", "",
      "--setting-sources", "",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--no-session-persistence",
    ];

    const stdout = await slot(() =>
      run("claude", args, { env, cwd, input: prompt, timeoutMs }).catch((error: unknown) => {
        if (error instanceof CommandError && error.notInstalled) throw new Error("Claude Code isn't installed or `claude` isn't on your PATH.");
        if (error instanceof CommandError && !error.timedOut && LOGIN_PROBLEM.test(error.message)) throw new ClaudeLoginError();
        throw error;
      }),
    );

    const result = JSON.parse(stdout) as CliResult;
    if (result.is_error) {
      if (LOGIN_PROBLEM.test(result.result ?? "")) throw new ClaudeLoginError();
      throw new Error(`Claude returned an error: ${result.result ?? "unknown"}`);
    }
    if (result.structured_output === undefined) throw new Error("Claude didn't return structured output");
    return result.structured_output as T;
  }

  return { ask };
}
