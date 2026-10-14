import { MultiFileDiff, PatchDiff } from "@pierre/diffs/react";
import { useEffect, useState } from "react";
import type { FileContentsPair, PrFile, PrRef } from "../../server/types.ts";
import { hunkPatch, type PatchHunk } from "../../server/patch.ts";
import { loadFile } from "./api.ts";
import type { Theme } from "./theme.ts";

interface Props {
  prRef: PrRef;
  file: PrFile;
  hunks: PatchHunk[];
  hunkIndex: number;
  fullFile: boolean;
  theme: Theme;
}

export function DiffPanel({ prRef, file, hunks, hunkIndex, fullFile, theme }: Props) {
  const options = { diffStyle: "unified", themeType: theme, disableFileHeader: true, overflow: "wrap", hunkSeparators: "simple" } as const;

  if (fullFile) return <FullFile prRef={prRef} file={file} options={options} />;
  if (hunks.length === 0) return <p className="empty">No text diff for this file. It's binary, a rename with no changes, or too big for GitHub to show.</p>;

  const hunk = hunks[hunkIndex];
  return (
    <div className="diff">
      <PatchDiff key={`${file.path}:${hunk.index}`} patch={hunkPatch(file.path, hunk, file.previousPath)} options={options} />
    </div>
  );
}

function FullFile({ prRef, file, options }: { prRef: PrRef; file: PrFile; options: object }) {
  const [contents, setContents] = useState<FileContentsPair | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContents(null);
    setError(null);
    loadFile(prRef, file.path).then(setContents, (e: Error) => setError(e.message));
  }, [prRef, file.path]);

  if (error) return <p className="empty error">{error}</p>;
  if (!contents) return <p className="empty label">Loading full file</p>;
  return (
    <div className="diff">
      <MultiFileDiff
        oldFile={{ name: file.previousPath ?? file.path, contents: contents.old ?? "" }}
        newFile={{ name: file.path, contents: contents.new ?? "" }}
        options={{ ...options, expandUnchanged: true }}
      />
    </div>
  );
}
