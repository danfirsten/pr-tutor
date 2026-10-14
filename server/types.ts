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
