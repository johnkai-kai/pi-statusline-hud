import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DirEntry, EnvReaders } from "./env.ts";

function linksToDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function listDir(path: string): DirEntry[] {
  return readdirSync(path, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    isDirectory:
      entry.isDirectory() ||
      (entry.isSymbolicLink() && linksToDirectory(join(path, entry.name))),
  }));
}

export const FS_READERS: EnvReaders = {
  readJson: (path) => JSON.parse(readFileSync(path, "utf-8")),
  readText: (path) => readFileSync(path, "utf-8"),
  exists: (path) => existsSync(path),
  listDir,
};
