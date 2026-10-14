#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { fetchPr } from "./gh.js";
import { parsePrRef } from "./prRef.js";
import { run } from "./run.js";
import { createStore } from "./store.js";
const FIRST_PORT = Number(process.env.PR_TUTOR_PORT ?? 4517);
const here = dirname(fileURLToPath(import.meta.url));
const webDir = [join(here, "..", "web"), join(here, "..", "dist", "web")].find((dir) => existsSync(join(dir, "index.html")));
async function main() {
    const ref = parsePrRef(process.argv[2] ?? "");
    if (!ref) {
        console.error("Usage: pr-tutor <https://github.com/owner/repo/pull/123 | owner/repo#123>");
        process.exit(1);
    }
    if (!webDir) {
        console.error("The page hasn't been built. Run `npm run build` in the pr-tutor folder.");
        process.exit(1);
    }
    try {
        await run("gh", ["auth", "status"]);
    }
    catch (error) {
        console.error(`gh isn't ready: ${error instanceof Error ? error.message : error}\nInstall the GitHub CLI and run \`gh auth login\`.`);
        process.exit(1);
    }
    const port = await listen(createApp({ store: createStore(), fetchPr, webDir }));
    const url = `http://localhost:${port}/?pr=${ref.owner}/${ref.repo}/${ref.number}`;
    console.log(`pr-tutor: ${url}`);
    openBrowser(url);
}
async function listen(handler) {
    for (let port = FIRST_PORT; port < FIRST_PORT + 10; port++) {
        if (await isPrTutor(port))
            return port;
        const bound = await new Promise((resolve) => {
            const server = createServer(handler);
            server.once("error", () => resolve(false));
            server.listen(port, "127.0.0.1", () => resolve(true));
        });
        if (bound)
            return port;
    }
    throw new Error(`No free port between ${FIRST_PORT} and ${FIRST_PORT + 9}`);
}
async function isPrTutor(port) {
    try {
        const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(500) });
        return (await res.json()).app === "pr-tutor";
    }
    catch {
        return false;
    }
}
function openBrowser(url) {
    const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
    execFile(cmd, args, () => { });
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
