const GROUPS: Array<[string, Array<[string, string]>]> = [
  [
    "Move around",
    [
      ["j / k", "Next / previous hunk"],
      ["n / p", "Next / previous file"],
      ["f", "Full file on / off"],
      ["b / r / m", "Briefing / your review / what you tend to miss"],
      ["J / K", "Scroll the notes (or the page) down / up"],
      ["Tab", "Move between buttons and links; Enter presses one"],
    ],
  ],
  [
    "Comment",
    [
      ["↓ / ↑", "Move the line cursor"],
      ["⇧↓ / ⇧↑", "Stretch it over several lines"],
      ["c or Enter", "Comment on the cursor line or lines"],
      ["e", "Edit your comment on this line or hunk"],
      ["a", "Use Claude's concern on this line (or the hunk's first) as a comment"],
      ["q", "Ask Claude about the cursor line or lines (or the whole hunk)"],
      ["Q", "Ask Claude about its concern on this line (or the hunk's first)"],
      ["] / [", "Next / previous of your comments"],
      ["Esc", "Clear the cursor"],
    ],
  ],
  [
    "Inside a comment",
    [
      ["⌘↵", "Save"],
      ["Esc or ⌘.", "Cancel (⌘. keeps you in full screen)"],
      ["⌥1 – ⌥4", "Blocker, suggestion, question, nit"],
      ["⌥C", "Coach this"],
      ["⌥U / ⌥K", "Use the coach's version / keep yours"],
      ["⌥D", "Delete"],
    ],
  ],
  [
    "Learning and wrap-up",
    [
      ["t", "Take first on / off"],
      ["i", "Type your take, or the summary on Your review"],
      ["⌘↵", "Reveal notes after your take"],
      ["s or ⌥S", "Skip this hunk's take"],
      ["v", "Change the verdict on Your review"],
      ["x", "Mark the file reviewed"],
    ],
  ],
  [
    "Other",
    [
      ["R", "Retry notes or the briefing"],
      ["T", "Theme"],
      ["?", "This list"],
    ],
  ],
];

export function KeyHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card keyhelp" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="label">Keys · ⌘ is Ctrl and ⌥ is Alt on Windows</div>
        <div className="keygroups">
          {GROUPS.map(([title, keys]) => (
            <section key={title}>
              <h3>{title}</h3>
              <table>
                <tbody>
                  {keys.map(([key, what]) => (
                    <tr key={key + what}>
                      <td className="mono">{key}</td>
                      <td>{what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
