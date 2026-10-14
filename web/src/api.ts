import type { FileContentsPair, Pr, PrRef, ReviewState } from "../../server/types.ts";

export function prRefFromLocation(): PrRef | null {
  const [owner, repo, number] = (new URLSearchParams(location.search).get("pr") ?? "").split("/");
  return owner && repo && Number(number) > 0 ? { owner, repo, number: Number(number) } : null;
}

const query = (ref: PrRef) => `owner=${encodeURIComponent(ref.owner)}&repo=${encodeURIComponent(ref.repo)}&number=${ref.number}`;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const loadPr = (ref: PrRef) => request<Pr>(`/api/pr?${query(ref)}`);

export const loadFile = (ref: PrRef, path: string) => request<FileContentsPair>(`/api/file?${query(ref)}&path=${encodeURIComponent(path)}`);

export const loadState = (ref: PrRef) => request<ReviewState>(`/api/state?${query(ref)}`);

export const saveState = (ref: PrRef, state: ReviewState) =>
  request<{ ok: true }>(`/api/state?${query(ref)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(state) });
