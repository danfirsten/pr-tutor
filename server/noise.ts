const LOCKFILES = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock",
  "cargo.lock", "poetry.lock", "pipfile.lock", "uv.lock", "go.sum", "gemfile.lock", "composer.lock", "packages.lock.json", "podfile.lock", "pubspec.lock", "mix.lock",
]);

const GENERATED = [
  /(^|\/)(dist|build|out|vendor|node_modules|generated|__generated__)\//,
  /\.min\.(js|css)$/,
  /\.map$/,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /\.(designer|g|g\.i)\.cs$/,
  /_pb2(_grpc)?\.py$/,
  /\.pb(\.gw)?\.go$/,
];

export function isNoise(path: string): boolean {
  const lower = path.toLowerCase();
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  return LOCKFILES.has(name) || GENERATED.some((pattern) => pattern.test(lower));
}
