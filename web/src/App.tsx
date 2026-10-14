import { useEffect, useState } from "react";
import type { Pr } from "../../server/types.ts";
import { loadPr, prRefFromLocation } from "./api.ts";
import { useTheme } from "./theme.ts";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; pr: Pr };

export function App() {
  const { theme, cycle } = useTheme();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const ref = prRefFromLocation();
    if (!ref) return setState({ kind: "error", message: "No PR in the address. Start pr-tutor from the terminal with a PR link." });
    loadPr(ref).then(
      (pr) => {
        setState({ kind: "ready", pr });
        document.title = `${pr.title} · pr-tutor`;
      },
      (error: Error) => setState({ kind: "error", message: error.message }),
    );
  }, []);

  if (state.kind === "loading") return <p className="center label">Loading pull request</p>;
  if (state.kind === "error") return <p className="center error">{state.message}</p>;

  const { pr } = state;
  return (
    <div className="shell">
      <header className="top">
        <h1>{pr.title}</h1>
        <a className="ref" href={pr.url} target="_blank" rel="noreferrer">
          {pr.owner}/{pr.repo}#{pr.number} ↗
        </a>
        <span className="ref branch">
          {pr.author} · {pr.headRef} → {pr.baseRef}
        </span>
        <span className="spacer" />
        <button className="pill" onClick={cycle} title="Theme">
          <span className="label">Theme · {theme}</span>
        </button>
      </header>
      <div className="body">
        <nav className="files" aria-label="Changed files">
          <div className="label">{pr.files.length} files</div>
          {pr.files.map((file) => (
            <button key={file.path} className="file" aria-current={file.path === selected} onClick={() => setSelected(file.path)} title={file.path}>
              <span className="name">{file.path}</span>
              <span className="counts">
                <span className="add">+{file.additions}</span> <span className="del">−{file.deletions}</span>
              </span>
            </button>
          ))}
        </nav>
        <main className="main">
          <div className="prose">
            <div className="label">Description</div>
            <h2>{pr.title}</h2>
            <pre>{pr.body || "No description."}</pre>
          </div>
        </main>
      </div>
    </div>
  );
}
