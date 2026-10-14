export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

export type FileStatus = "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";

export interface PrFile {
  path: string;
  previousPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface Pr extends PrRef {
  title: string;
  body: string;
  url: string;
  author: string;
  baseSha: string;
  headSha: string;
  baseRef: string;
  headRef: string;
  files: PrFile[];
}

export interface ReviewState {
  reviewed: string[];
}

export interface FileContentsPair {
  old: string | null;
  new: string | null;
}

export type NoteState = { state: "none" | "idle" | "queued" | "running" | "done" } | { state: "error"; error: string; login?: boolean };

export const CATEGORIES = [
  "understanding", "correctness", "edge-cases", "error-handling", "tests", "naming-readability",
  "security", "performance", "concurrency", "api-contract", "design",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Miss {
  at: string;
  owner: string;
  repo: string;
  number: number;
  path: string;
  hunkIndex: number;
  category: Category;
  what: string;
}

export interface CategorySummary {
  category: Category;
  count: number;
  latest: Miss[];
}

export interface Comparison {
  line: string;
  caught: string[];
  missed: Array<{ category: Category; what: string }>;
}

export interface Take {
  path: string;
  hunkIndex: number;
  headSha: string;
  take: string;
  at: string;
  comparison?: Comparison;
  error?: string;
}
