import { MultiFileDiff, PatchDiff } from "@pierre/diffs/react";
import type { DiffLineAnnotation } from "@pierre/diffs";
import { useEffect, useState, type ReactNode } from "react";
import type { FileContentsPair, PrFile, PrRef } from "../../server/types.ts";
import { hunkPatch, type PatchHunk } from "../../server/patch.ts";
import { loadFile, type Concern } from "./api.ts";
import { SeverityPill } from "./NotesPanel.tsx";
import type { Theme } from "./theme.ts";

interface Props {
  prRef: PrRef;
  file: PrFile;
  hunks: PatchHunk[];
  hunkIndex: number;
  fullFile: boolean;
  theme: Theme;
  concerns: Concern[];
}

export function DiffPanel({ prRef, file, hunks, hunkIndex, fullFile, theme, concerns }: Props) {
  const options = { diffStyle: "unified", themeType: theme, disableFileHeader: true, overflow: "wrap", hunkSeparators: "simple" } as const;

  const lineAnnotations = concerns.map((concern) => ({
    side: concern.side === "old" ? ("deletions" as const) : ("additions" as const),
    lineNumber: concern.line,
    metadata: concern,
  }));
  const renderAnnotation = ({ metadata }: { metadata: Concern }) => (
    <div className="inline-concern">
      <SeverityPill severity={metadata.severity} />
      <span>{metadata.text}</span>
    </div>
  );

  if (fullFile) return <FullFile prRef={prRef} file={file} options={options} lineAnnotations={lineAnnotations} renderAnnotation={renderAnnotation} />;
  if (hunks.length === 0) return <p className="empty">No text diff for this file. It's binary, a rename with no changes, or too big for GitHub to show.</p>;

  const hunk = hunks[hunkIndex];
  return (
    <div className="diff">
      <PatchDiff
        key={`${file.path}:${hunk.index}`}
        patch={hunkPatch(file.path, hunk, file.previousPath)}
        options={options}
        lineAnnotations={lineAnnotations}
        renderAnnotation={renderAnnotation}
      />
    </div>
  );
}

interface FullFileProps {
  prRef: PrRef;
  file: PrFile;
  options: object;
  lineAnnotations: DiffLineAnnotation<Concern>[];
  renderAnnotation: (annotation: DiffLineAnnotation<Concern>) => ReactNode;
}

function FullFile({ prRef, file, options, lineAnnotations, renderAnnotation }: FullFileProps) {
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
        lineAnnotations={lineAnnotations}
        renderAnnotation={renderAnnotation}
      />
    </div>
  );
}
