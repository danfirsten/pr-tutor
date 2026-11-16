import { useEffect, useState } from "react";

const Bar = ({ w, h = 10, r }: { w: string; h?: number; r?: number }) => <span className="sk" style={{ width: w, height: h, borderRadius: r }} />;

export function ShellSkeleton() {
  return (
    <div className="shell" aria-busy="true" aria-label="Loading pull request">
      <header className="top">
        <Bar w="280px" h={14} />
        <Bar w="120px" />
        <span className="spacer" />
        <Bar w="220px" h={30} r={999} />
      </header>
      <div className="body">
        <nav className="files sk-col">
          <Bar w="40%" />
          {["85%", "70%", "78%", "60%", "82%", "66%", "74%"].map((w, i) => (
            <Bar key={i} w={w} h={12} />
          ))}
        </nav>
        <main className="main">
          <DiffSkeleton label="Loading pull request" />
        </main>
      </div>
    </div>
  );
}

export function DiffSkeleton({ label }: { label: string }) {
  return (
    <div className="sk-col" aria-busy="true">
      <span className="label">{label}</span>
      <div className="diff sk-block sk-col">
        {["55%", "72%", "64%", "80%", "40%", "68%", "30%", "58%"].map((w, i) => (
          <Bar key={i} w={w} h={11} />
        ))}
      </div>
    </div>
  );
}

export function NotesSkeleton({ label }: { label: string }) {
  const seconds = useElapsed();
  return (
    <div className="sk-col" aria-busy="true">
      <p className="muted">
        {label}
        {seconds >= 3 ? ` · ${seconds}s` : ""}
      </p>
      <Bar w="45%" h={12} />
      <Bar w="95%" />
      <Bar w="88%" />
      <Bar w="60%" />
      <span className="sk-gap" />
      <Bar w="40%" h={12} />
      <Bar w="90%" />
      <Bar w="75%" />
      <span className="sk-gap" />
      <Bar w="100%" h={70} r={16} />
    </div>
  );
}

export function ProseSkeleton({ label }: { label: string }) {
  return (
    <div className="sk-col" aria-busy="true">
      <p className="lede muted">{label}</p>
      {["92%", "86%", "70%"].map((w, i) => (
        <Bar key={i} w={w} h={14} />
      ))}
      <span className="sk-gap" />
      <Bar w="30%" h={16} />
      {["88%", "80%", "60%"].map((w, i) => (
        <Bar key={i} w={w} />
      ))}
    </div>
  );
}

function useElapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return seconds;
}
