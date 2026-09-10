import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanResolvedEnv } from "../src/collect/resolved-env.ts";
import { FS_READERS } from "../src/collect/fs-readers.ts";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";

function setup(): { root: string; agent: string; cwd: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "pi-hud-resolved-"));
  const agent = join(root, "agent");
  const cwd = join(root, "project");
  mkdirSync(agent, { recursive: true });
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  return { root, agent, cwd, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value), "utf8");
}

test("resolved inventory follows official manifest glob and multi-entry semantics", async () => {
  const env = setup();
  try {
    const baseline = await scanResolvedEnv(env.agent, env.cwd, env.root, FS_READERS);
    const pkg = join(env.cwd, ".pi", "local-pkg");
    mkdirSync(join(pkg, "extensions", "nested"), { recursive: true });
    mkdirSync(join(pkg, "skills", "one"), { recursive: true });
    writeFileSync(join(pkg, "extensions", "a.ts"), "", "utf8");
    writeFileSync(join(pkg, "extensions", "nested", "index.ts"), "", "utf8");
    writeFileSync(join(pkg, "skills", "one", "SKILL.md"), "", "utf8");
    writeJson(join(pkg, "package.json"), {
      pi: {
        extensions: ["extensions/*.ts", "extensions/nested"],
        skills: ["skills/*"],
      },
    });
    writeJson(join(env.cwd, ".pi", "settings.json"), {
      packages: [{ source: "./local-pkg" }],
    });
    new ProjectTrustStore(env.agent).set(env.cwd, true);
    const result = await scanResolvedEnv(env.agent, env.cwd, env.root, FS_READERS);
    assert.equal(result.packages, 1);
    assert.equal(result.extensions - baseline.extensions, 2);
    assert.equal(result.skills - baseline.skills, 1);
    assert.deepEqual(result.packageRoots, [pkg]);
  } finally {
    env.cleanup();
  }
});

test("disabled package resources remain in configured inventory", async () => {
  const env = setup();
  try {
    const baseline = await scanResolvedEnv(env.agent, env.cwd, env.root, FS_READERS);
    const pkg = join(env.agent, "local-pkg");
    mkdirSync(join(pkg, "extensions"), { recursive: true });
    mkdirSync(join(pkg, "skills", "hidden"), { recursive: true });
    writeFileSync(join(pkg, "extensions", "main.ts"), "", "utf8");
    writeFileSync(join(pkg, "skills", "hidden", "SKILL.md"), "", "utf8");
    writeJson(join(pkg, "package.json"), {
      pi: { extensions: ["extensions/main.ts"], skills: ["skills/hidden"] },
    });
    writeJson(join(env.agent, "settings.json"), {
      packages: [{ source: "./local-pkg", extensions: [], skills: [] }],
    });
    const result = await scanResolvedEnv(env.agent, env.cwd, env.root, FS_READERS);
    assert.equal(result.packages, 1);
    assert.equal(result.extensions - baseline.extensions, 1);
    assert.equal(result.skills - baseline.skills, 1);
  } finally {
    env.cleanup();
  }
});

test("object sources and missing packages are reported without installation", async () => {
  const env = setup();
  try {
    writeJson(join(env.agent, "settings.json"), {
      packages: [
        { source: "npm:missing-package@9.9.9" },
        { source: "git:github.com/example/missing@main" },
      ],
    });
    const before = FS_READERS.exists(join(env.agent, "package.json"));
    const result = await scanResolvedEnv(env.agent, env.cwd, env.root, FS_READERS);
    assert.equal(result.packages, 2);
    assert.deepEqual(result.packageRoots, []);
    assert.equal(FS_READERS.exists(join(env.agent, "package.json")), before);
  } finally {
    env.cleanup();
  }
});
