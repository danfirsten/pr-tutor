import { describe, expect, it } from "vitest";
import { isNoise } from "./noise.ts";

describe("isNoise", () => {
  it.each([
    "package-lock.json", "web/yarn.lock", "pnpm-lock.yaml", "Cargo.lock", "poetry.lock", "go.sum", "Gemfile.lock", "composer.lock", "packages.lock.json",
    "dist/app.js", "build/out.css", "src/vendor/lib.js", "app.min.js", "styles.min.css", "bundle.js.map",
    "src/__snapshots__/a.test.ts.snap", "Form1.Designer.cs", "Api.g.cs", "proto/user_pb2.py", "api.pb.go", "src/generated/client.ts",
  ])("treats %s as noise", (path) => expect(isNoise(path)).toBe(true));

  it.each(["src/index.ts", "package.json", "README.md", "src/build.ts", "src/distance.ts", "tests/snapshot.test.ts"])(
    "treats %s as real code",
    (path) => expect(isNoise(path)).toBe(false),
  );
});
