import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import type { fetchFileAt as FetchFileAt, fetchPr as FetchPr } from "./gh.ts";
import type { Store } from "./store.ts";
import type { createNotes } from "./notes.ts";
import type { createBriefings } from "./briefing.ts";
import { cleanDraft, emptyDraft, renderMarkdown, type Draft, type DraftComment } from "./review.ts";
import type { Coaching } from "./prompts/coach.ts";
import type { Pr, PrRef, ReviewState } from "./types.ts";

export interface AppDeps {
  store: Store;
  fetchPr: typeof FetchPr;
  fetchFileAt: typeof FetchFileAt;
  notes: ReturnType<typeof createNotes>;
  briefings: ReturnType<typeof createBriefings>;
  coach: (pr: Pr, comment: DraftComment) => Promise<Coaching>;
  webDir: string;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
};

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function createApp({ store, fetchPr, fetchFileAt, notes, briefings, coach, webDir }: AppDeps) {
  const prs = new Map<string, Pr>();

  async function loadPr(ref: PrRef, refresh: boolean): Promise<Pr> {
    const key = `${ref.owner}/${ref.repo}#${ref.number}`;
    const cached = prs.get(key);
    if (cached && !refresh) return cached;
    const pr = await fetchPr(ref);
    prs.set(key, pr);
    await store.writeReviewJson(ref, "pr.json", pr);
    return pr;
  }

  async function loadFile(ref: PrRef, path: string) {
    const pr = await loadPr(ref, false);
    const file = pr.files.find((f) => f.path === path);
    if (!file) return null;
    const read = (at: string, sha: string) => fetchFileAt(ref, at, sha).catch(() => null);
    const [oldText, newText] = await Promise.all([
      file.status === "added" ? null : read(file.previousPath ?? file.path, pr.baseSha),
      file.status === "removed" ? null : read(file.path, pr.headSha),
    ]);
    return { old: oldText, new: newText };
  }

  async function serveStatic(pathname: string, res: ServerResponse) {
    const file = normalize(join(webDir, pathname === "/" ? "index.html" : pathname));
    const inside = file.startsWith(webDir + sep);
    const target = inside ? file : join(webDir, "index.html");
    try {
      const body = await readFile(target);
      res.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream" }).end(body);
    } catch {
      const index = await readFile(join(webDir, "index.html"));
      res.writeHead(200, { "content-type": TYPES[".html"] }).end(index);
    }
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    if (!LOCAL_HOST.test(req.headers.host ?? "") || (origin && !LOCAL_HOST.test(origin.replace(/^https?:\/\//, "")))) {
      res.writeHead(403).end("pr-tutor only answers on localhost");
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (url.pathname === "/api/health") return json(res, 200, { app: "pr-tutor" });
      if (url.pathname === "/api/pr") {
        const ref = refFromQuery(url.searchParams);
        if (!ref) return json(res, 400, { error: "Expected owner, repo and number" });
        return json(res, 200, await loadPr(ref, url.searchParams.has("refresh")));
      }
      if (url.pathname === "/api/file") {
        const ref = refFromQuery(url.searchParams);
        const path = url.searchParams.get("path");
        if (!ref || !path) return json(res, 400, { error: "Expected owner, repo, number and path" });
        const contents = await loadFile(ref, path);
        return contents ? json(res, 200, contents) : json(res, 404, { error: "That file isn't in this PR" });
      }
      if (url.pathname === "/api/state") {
        const ref = refFromQuery(url.searchParams);
        if (!ref) return json(res, 400, { error: "Expected owner, repo and number" });
        if (req.method === "PUT") {
          const state = (await readBody(req)) as Partial<ReviewState>;
          const reviewed = Array.isArray(state.reviewed) ? state.reviewed.filter((p) => typeof p === "string") : [];
          await store.writeReviewJson(ref, "state.json", { reviewed });
          return json(res, 200, { ok: true });
        }
        return json(res, 200, (await store.readReviewJson<ReviewState>(ref, "state.json")) ?? { reviewed: [] });
      }
      if (url.pathname === "/api/review") {
        const ref = refFromQuery(url.searchParams);
        if (!ref) return json(res, 400, { error: "Expected owner, repo and number" });
        const pr = await loadPr(ref, false);
        if (req.method === "PUT") {
          const draft = cleanDraft(pr, (await readBody(req)) as Draft);
          await store.writeReviewJson(ref, "review.json", draft);
          await store.writeReviewText(ref, "review.md", renderMarkdown(pr, draft));
          return json(res, 200, draft);
        }
        return json(res, 200, (await store.readReviewJson<Draft>(ref, "review.json")) ?? emptyDraft(pr));
      }
      if (url.pathname === "/api/coach" && req.method === "POST") {
        const ref = refFromQuery(url.searchParams);
        if (!ref) return json(res, 400, { error: "Expected owner, repo and number" });
        const comment = (await readBody(req)) as DraftComment;
        if (typeof comment?.body !== "string" || !comment.body.trim()) return json(res, 400, { error: "Write a draft first" });
        return json(res, 200, await coach(await loadPr(ref, false), comment));
      }
      if (url.pathname === "/api/briefing") {
        const ref = refFromQuery(url.searchParams);
        if (!ref) return json(res, 400, { error: "Expected owner, repo and number" });
        return json(res, 200, await briefings.get(await loadPr(ref, false), url.searchParams.has("retry")));
      }
      if (url.pathname.startsWith("/api/notes")) {
        const ref = refFromQuery(url.searchParams);
        if (!ref) return json(res, 400, { error: "Expected owner, repo and number" });
        const pr = await loadPr(ref, false);
        const path = url.searchParams.get("path") ?? "";
        if (url.pathname === "/api/notes/start" && req.method === "POST") {
          notes.start(pr);
          return json(res, 200, notes.status(pr));
        }
        if (url.pathname === "/api/notes/status") return json(res, 200, notes.status(pr));
        if (url.pathname === "/api/notes/retry" && req.method === "POST") {
          notes.retry(pr, path);
          return json(res, 200, notes.status(pr));
        }
        if (url.pathname === "/api/notes") return json(res, 200, await notes.get(pr, path));
      }
      if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "Not found" });
      await serveStatic(url.pathname, res);
    } catch (error) {
      json(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}

function refFromQuery(q: URLSearchParams): PrRef | null {
  const owner = q.get("owner");
  const repo = q.get("repo");
  const number = Number(q.get("number"));
  return owner && repo && number > 0 ? { owner, repo, number } : null;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}
