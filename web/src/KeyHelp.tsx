const KEYS = [
  ["j / k", "Next / previous hunk"],
  ["n / p", "Next / previous file"],
  ["f", "Full file on / off"],
  ["x", "Mark file reviewed"],
  ["?", "This list"],
  ["Esc", "Close"],
];

export function KeyHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="label">Keys</div>
        <table>
          <tbody>
            {KEYS.map(([key, what]) => (
              <tr key={key}>
                <td className="mono">{key}</td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
