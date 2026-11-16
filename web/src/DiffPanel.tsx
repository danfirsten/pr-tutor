import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import { MultiFileDiff, PatchDiff } from "@pierre/diffs/react";
import { useEffect, useRef } from "react";
import { hunkPatch, type PatchHunk } from "../../server/patch.ts";
import type { FileContentsPair, PrFile } from "../../server/types.ts";
import type { Concern, DraftComment } from "./api.ts";
import { SeverityPill } from "./NotesPanel.tsx";
import { DiffSkeleton } from "./Skeleton.tsx";
import type { Theme } from "./theme.ts";

type Annotation = { kind: "concern"; concern: Concern } | { kind: "comment"; comment: DraftComment };
export type LineSide = "deletions" | "additions";

interface Props {
  file: PrFile;
  hunks: PatchHunk[];
  hunkIndex: number;
  fullFile: boolean;
  contents: FileContentsPair | null | { error: string };
  motion: string;
  theme: Theme;
  concerns: Concern[];
  comments: DraftComment[];
  selected: SelectedLineRange | null;
  onClickLine: (line: number, side: LineSide, extend: boolean) => void;
  onSelectRange: (range: SelectedLineRange) => void;
  onComment: (range: SelectedLineRange) => void;
  onEdit: (comment: DraftComment) => void;
  onUseConcern: (concern: Concern) => void;
  onAskConcern: (concern: Concern) => void;
}

export function DiffPanel({ file, hunks, hunkIndex, fullFile, contents, motion, theme, concerns, comments, selected, onClickLine, onSelectRange, onComment, onEdit, onUseConcern, onAskConcern }: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const current = useRef(selected);
  current.current = selected;

  const ready = fullFile ? !!contents && !("error" in contents) : true;
  useEffect(() => {
    if (!selected || !ready) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const scroll = () => {
      const root = wrapper.current?.querySelector("*")?.shadowRoot;
      const type = selected.endSide === "deletions" || (!selected.endSide && selected.side === "deletions") ? "change-deletion" : "";
      const rows = [...(root?.querySelectorAll<HTMLElement>(`[data-column-number="${selected.end}"]`) ?? [])];
      const row = rows.find((r) => (type ? r.dataset.lineType === type : r.dataset.lineType !== "change-deletion")) ?? rows[0];
      if (row) row.scrollIntoView({ block: tries ? "center" : "nearest", behavior: tries ? "auto" : "smooth" });
      else if (tries++ < 20) timer = setTimeout(scroll, 50);
    };
    scroll();
    return () => clearTimeout(timer);
  }, [selected, ready]);

  const options = {
    diffStyle: "unified",
    themeType: theme,
    disableFileHeader: true,
    overflow: "wrap",
    hunkSeparators: "simple",
    lineHoverHighlight: "both",
    enableLineSelection: true,
    enableGutterUtility: true,
    onGutterUtilityClick: (range: SelectedLineRange) => onComment(range),
    onLineClick: ({ lineNumber, annotationSide, event }: { lineNumber: number; annotationSide: LineSide; event: PointerEvent }) => onClickLine(lineNumber, annotationSide, event.shiftKey),
    onLineSelected: (range: SelectedLineRange | null) => {
      if (range && !sameRange(range, current.current)) onSelectRange(range);
    },
  } as const;

  const lineAnnotations: DiffLineAnnotation<Annotation>[] = [
    ...concerns.map((concern) => ({ side: concern.side === "old" ? ("deletions" as const) : ("additions" as const), lineNumber: concern.line, metadata: { kind: "concern" as const, concern } })),
    ...comments.map((comment) => ({ side: comment.side === "LEFT" ? ("deletions" as const) : ("additions" as const), lineNumber: comment.line, metadata: { kind: "comment" as const, comment } })),
  ];

  const renderAnnotation = ({ metadata }: DiffLineAnnotation<Annotation>) =>
    metadata.kind === "concern" ? (
      <div className="inline-concern">
        <SeverityPill severity={metadata.concern.severity} />
        <span className="text">{metadata.concern.text}</span>
        <span className="actions">
          <button className="textbtn" onClick={() => onAskConcern(metadata.concern)}>
            Ask · Q
          </button>
          <button className="textbtn" onClick={() => onUseConcern(metadata.concern)}>
            Use as comment · a
          </button>
        </span>
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

  if (fullFile) {
    if (contents && "error" in contents) return <p className="empty error">{contents.error}</p>;
    if (!contents) return <DiffSkeleton label="Loading full file" />;
    return (
      <div className={`diff ${motion}`} ref={wrapper}>
        <MultiFileDiff
          oldFile={{ name: file.previousPath ?? file.path, contents: contents.old ?? "" }}
          newFile={{ name: file.path, contents: contents.new ?? "" }}
          options={{ ...options, expandUnchanged: true }}
          lineAnnotations={lineAnnotations}
          renderAnnotation={renderAnnotation}
          selectedLines={selected}
        />
      </div>
    );
  }
  if (hunks.length === 0) return <p className="empty">No text diff for this file. It's binary, a rename with no changes, or too big for GitHub to show.</p>;

  const hunk = hunks[hunkIndex];
  return (
    <div className={`diff ${motion}`} ref={wrapper} key={`${file.path}:${hunk.index}`}>
      <PatchDiff patch={hunkPatch(file.path, hunk, file.previousPath)} options={options} lineAnnotations={lineAnnotations} renderAnnotation={renderAnnotation} selectedLines={selected} />
    </div>
  );
}

function sameRange(a: SelectedLineRange, b: SelectedLineRange | null) {
  return !!b && a.start === b.start && a.end === b.end && (a.side ?? "additions") === (b.side ?? "additions") && (a.endSide ?? a.side ?? "additions") === (b.endSide ?? b.side ?? "additions");
}
