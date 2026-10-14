import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import { MultiFileDiff, PatchDiff } from "@pierre/diffs/react";
import { useEffect, useState, type ReactNode } from "react";
import { hunkPatch, type PatchHunk } from "../../server/patch.ts";
import type { FileContentsPair, PrFile, PrRef } from "../../server/types.ts";
import { loadFile, type Concern, type DraftComment } from "./api.ts";
import { SeverityPill } from "./NotesPanel.tsx";
import type { Theme } from "./theme.ts";

type Annotation = { kind: "concern"; concern: Concern } | { kind: "comment"; comment: DraftComment };

interface Props {
  prRef: PrRef;
  file: PrFile;
  hunks: PatchHunk[];
  hunkIndex: number;
  fullFile: boolean;
  theme: Theme;
  concerns: Concern[];
  comments: DraftComment[];
  selected: DraftComment | null;
  onSelect: (range: SelectedLineRange | null) => void;
  onEdit: (comment: DraftComment) => void;
}

export function DiffPanel({ prRef, file, hunks, hunkIndex, fullFile, theme, concerns, comments, selected, onSelect, onEdit }: Props) {
  const options = {
    diffStyle: "unified",
    themeType: theme,
    disableFileHeader: true,
    overflow: "wrap",
    hunkSeparators: "simple",
    enableLineSelection: true,
    onLineSelected: onSelect,
  } as const;

  const lineAnnotations: DiffLineAnnotation<Annotation>[] = [
    ...concerns.map((concern) => ({ side: concern.side === "old" ? ("deletions" as const) : ("additions" as const), lineNumber: concern.line, metadata: { kind: "concern" as const, concern } })),
    ...comments.map((comment) => ({ side: comment.side === "LEFT" ? ("deletions" as const) : ("additions" as const), lineNumber: comment.line, metadata: { kind: "comment" as const, comment } })),
  ];

  const renderAnnotation = ({ metadata }: DiffLineAnnotation<Annotation>) =>
    metadata.kind === "concern" ? (
      <div className="inline-concern">
        <SeverityPill severity={metadata.concern.severity} />
        <span>{metadata.concern.text}</span>
      </div>
    ) : (
      <div className="inline-comment">
        <div className="row">
          <span className="who">You</span>
          <span className={`status ${metadata.comment.label}`}>
            <span className="dot" />
            {metadata.comment.label}
          </span>
          <span className="spacer" />
          <button className="textbtn" onClick={() => onEdit(metadata.comment)}>
            Edit
          </button>
        </div>
        <span>{metadata.comment.body}</span>
      </div>
    );

  if (fullFile) return <FullFile prRef={prRef} file={file} options={{ ...options, enableLineSelection: false }} lineAnnotations={lineAnnotations} renderAnnotation={renderAnnotation} />;
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
        selectedLines={selected ? toRange(selected) : null}
      />
    </div>
  );
}

const toSide = (side: DraftComment["side"]) => (side === "LEFT" ? ("deletions" as const) : ("additions" as const));

function toRange(c: DraftComment): SelectedLineRange {
  return c.start_line ? { start: c.start_line, side: toSide(c.start_side ?? c.side), end: c.line, endSide: toSide(c.side) } : { start: c.line, side: toSide(c.side), end: c.line };
}

interface FullFileProps {
  prRef: PrRef;
  file: PrFile;
  options: object;
  lineAnnotations: DiffLineAnnotation<Annotation>[];
  renderAnnotation: (annotation: DiffLineAnnotation<Annotation>) => ReactNode;
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
    <>
      <p className="muted fine-print">Full-file view is read-only. Press f to go back to hunks to comment.</p>
      <div className="diff">
        <MultiFileDiff
          oldFile={{ name: file.previousPath ?? file.path, contents: contents.old ?? "" }}
          newFile={{ name: file.path, contents: contents.new ?? "" }}
          options={{ ...options, expandUnchanged: true }}
          lineAnnotations={lineAnnotations}
          renderAnnotation={renderAnnotation}
        />
      </div>
    </>
  );
}
