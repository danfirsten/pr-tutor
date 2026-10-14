import { useEffect, useState } from "react";
import { refLabel } from "../../server/prRef.ts";
import { loadMisses, type CategorySummary } from "./api.ts";

export function MissesView() {
  const [data, setData] = useState<{ total: number; categories: CategorySummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMisses().then(setData, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="label">Loading</p>;

  const max = Math.max(1, ...data.categories.map((c) => c.count));
  return (
    <div className="prose misses">
      <div className="label">Learning log</div>
      <h2>What you tend to miss</h2>
      {data.total === 0 ? (
        <p className="lede">Nothing yet. Turn on "Take first" in the header, write your own take before reading the notes, and your misses will build up here across every PR you review.</p>
      ) : (
        <>
          <p className="lede">
            {data.total} miss{data.total === 1 ? "" : "es"} across your reviews. Once a category comes up twice, Claude's notes push harder on it.
          </p>
          <table className="bars">
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.category}>
                  <td className="mono">{c.category.replace("-", " ")}</td>
                  <td className="bar-cell">
                    <span className="bar" style={{ width: `${(c.count / max) * 100}%` }} />
                  </td>
                  <td className="num mono">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.categories.map((c) => (
            <section key={c.category}>
              <h3>{c.category.replace("-", " ")}</h3>
              <ul>
                {c.latest.map((m) => (
                  <li key={m.at + m.what}>
                    {m.what} <span className="muted mono">· {refLabel(m)} {m.path}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
