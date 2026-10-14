import type { Pr, PrRef } from "../../server/types.ts";

export function prRefFromLocation(): PrRef | null {
  const [owner, repo, number] = (new URLSearchParams(location.search).get("pr") ?? "").split("/");
  return owner && repo && Number(number) > 0 ? { owner, repo, number: Number(number) } : null;
}

export async function loadPr(ref: PrRef): Promise<Pr> {
  const res = await fetch(`/api/pr?owner=${encodeURIComponent(ref.owner)}&repo=${encodeURIComponent(ref.repo)}&number=${ref.number}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as Pr;
}
