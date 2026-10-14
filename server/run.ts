import { execFile } from "node:child_process";

export interface RunOptions {
  env?: NodeJS.ProcessEnv;
  input?: string;
  cwd?: string;
  timeoutMs?: number;
}

export type Run = (cmd: string, args: string[], options?: RunOptions) => Promise<string>;

export class CommandError extends Error {
  readonly notInstalled: boolean;
  readonly timedOut: boolean;

  constructor(message: string, notInstalled: boolean, timedOut = false) {
    super(message);
    this.notInstalled = notInstalled;
    this.timedOut = timedOut;
  }
}

export const run: Run = (cmd, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      { env: options.env ?? process.env, cwd: options.cwd, maxBuffer: 256 * 1024 * 1024, timeout: options.timeoutMs ?? 180_000 },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return reject(new CommandError(`${cmd} is not installed or not on PATH`, true));
        if (error.killed) return reject(new CommandError(`${cmd} took too long and was stopped`, false, true));
        reject(new CommandError((stderr || stdout || error.message).trim(), false));
      },
    );
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
