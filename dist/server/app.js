import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".woff2": "font/woff2",
};
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
export function createApp({ store, fetchPr, webDir }) {
    const prs = new Map();
    async function loadPr(ref, refresh) {
        const key = `${ref.owner}/${ref.repo}#${ref.number}`;
        const cached = prs.get(key);
        if (cached && !refresh)
            return cached;
        const pr = await fetchPr(ref);
        prs.set(key, pr);
        await store.writeReviewJson(ref, "pr.json", pr);
        return pr;
    }
    async function serveStatic(pathname, res) {
        const file = normalize(join(webDir, pathname === "/" ? "index.html" : pathname));
        const inside = file.startsWith(webDir + sep);
        const target = inside ? file : join(webDir, "index.html");
        try {
            const body = await readFile(target);
            res.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream" }).end(body);
        }
        catch {
            const index = await readFile(join(webDir, "index.html"));
            res.writeHead(200, { "content-type": TYPES[".html"] }).end(index);
        }
    }
    return async function handle(req, res) {
        if (!LOCAL_HOST.test(req.headers.host ?? "")) {
            res.writeHead(403).end("pr-tutor only answers on localhost");
            return;
        }
        const url = new URL(req.url ?? "/", "http://localhost");
        try {
            if (url.pathname === "/api/health")
                return json(res, 200, { app: "pr-tutor" });
            if (url.pathname === "/api/pr") {
                const ref = refFromQuery(url.searchParams);
                if (!ref)
                    return json(res, 400, { error: "Expected owner, repo and number" });
                return json(res, 200, await loadPr(ref, url.searchParams.has("refresh")));
            }
            if (url.pathname.startsWith("/api/"))
                return json(res, 404, { error: "Not found" });
            await serveStatic(url.pathname, res);
        }
        catch (error) {
            json(res, 502, { error: error instanceof Error ? error.message : String(error) });
        }
    };
}
function refFromQuery(q) {
    const owner = q.get("owner");
    const repo = q.get("repo");
    const number = Number(q.get("number"));
    return owner && repo && number > 0 ? { owner, repo, number } : null;
}
function json(res, status, body) {
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}
