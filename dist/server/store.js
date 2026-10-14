import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
export function createStore(root = join(homedir(), ".pr-tutor")) {
    const reviewDir = (ref) => join(root, "reviews", ref.owner, ref.repo, String(ref.number));
    return {
        root,
        reviewDir,
        readReviewJson: (ref, name) => readJson(join(reviewDir(ref), name)),
        writeReviewJson: (ref, name, value) => writeJson(join(reviewDir(ref), name), value),
    };
}
export async function readJson(path) {
    try {
        return JSON.parse(await readFile(path, "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
}
export async function writeJson(path, value) {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(value, null, 2) + "\n");
    await rename(temp, path);
}
