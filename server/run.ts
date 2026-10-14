import { execFile } from "node:child_process";

export type Run = (cmd: string, args: string[], env?: NodeJS.ProcessEnv) => Promise<string>;

export class CommandError extends Error {
  readonly notInstalled: boolean;

  constructor(message: string, notInstalled: boolean) {
    super(message);
    this.notInstalled = notInstalled;
  }
}

export const run: Run = (cmd, args, env) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { env: env ?? process.env, maxBuffer: 256 * 1024 * 1024, timeout: 180_000 }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      const notInstalled = (error as NodeJS.ErrnoException).code === "ENOENT";
      reject(new CommandError(notInstalled ? `${cmd} is not installed or not on PATH` : (stderr || stdout || error.message).trim(), notInstalled));
    });
  });
