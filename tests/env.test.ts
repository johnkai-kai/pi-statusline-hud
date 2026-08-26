import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanEnv, type EnvReaders } from "../src/collect/env.ts";
import { FS_READERS, listDir } from "../src/collect/fs-readers.ts";

const AGENT = "/base/agent";
const HOME = "/base/hm";
const CWD = "/base/work/proj";

const norm = (p: string): string => p.replace(/\\/g, "/");

interface VfsSpec {
  dirs?: Record<string, string[]>;
  files?: string[];
  json?: Record<string, unknown>;
  text?: Record<string, string>;
}

function makeReaders(spec: VfsSpec, over: Partial<EnvReaders> = {}): EnvReaders {
  const dirs = spec.dirs ?? {};
  const files = new Set(spec.files ?? []);
  const json = spec.json ?? {};
  const text = spec.text ?? {};
  return {
    readJson: (raw) => {
      const path = norm(raw);
      if (Object.hasOwn(json, path)) return json[path];
      throw new Error(`missing ${path}`);
    },
    readText: (raw) => {
      const path = norm(raw);
      if (Object.hasOwn(text, path)) return text[path] as string;
      throw new Error(`missing ${path}`);
    },
    exists: (raw) => {
      const path = norm(raw);
      return files.has(path) || Object.hasOwn(dirs, path);
    },
    listDir: (raw) => {
      const path = norm(raw);
      const entries = dirs[path];
      if (entries === undefined) throw new Error(`missing ${path}`);
      return entries.map((name) =>
        name.endsWith("/")
          ? { name: name.slice(0, -1), isDirectory: true }
          : { name, isDirectory: false },
      );
    },
    ...over,
  };
}

const skillDir = (path: string): Record<string, string[]> => ({ [path]: ["SKILL.md"] });

function sevenSourceReaders(over: Partial<EnvReaders> = {}): EnvReaders {
  return makeReaders(
    {
      dirs: {
        [`${AGENT}/skills`]: ["loose.md", "alpha/"],
        ...skillDir(`${AGENT}/skills/alpha`),
        [`${HOME}/.agents/skills`]: ["ignored.md", "beta/"],
        ...skillDir(`${HOME}/.agents/skills/beta`),
        [`${CWD}/.pi/skills`]: ["projmd.md", "gamma/"],
        ...skillDir(`${CWD}/.pi/skills/gamma`),
        [`${CWD}/.agents/skills`]: ["nope.md", "delta/"],
        ...skillDir(`${CWD}/.agents/skills/delta`),
        "/base/work/.agents/skills": ["eps/"],
        ...skillDir("/base/work/.agents/skills/eps"),
        [`${AGENT}/npm/node_modules/pkg/skills`]: ["zeta/"],
        ...skillDir(`${AGENT}/npm/node_modules/pkg/skills/zeta`),
        "/base/extra/dir": ["eta/"],
        ...skillDir("/base/extra/dir/eta"),
      },
      files: ["/base/work/.git", "/base/extra/solo.md"],
      json: {
        [`${AGENT}/settings.json`]: {
          packages: ["npm:pkg"],
          skills: ["/base/extra/solo.md", "/base/extra/dir"],
        },
        [`${AGENT}/npm/node_modules/pkg/package.json`]: { pi: { skills: ["./skills"] } },
      },
    },
    over,
  );
}

test("scanEnv counts all seven skill sources", () => {
  const result = scanEnv(AGENT, CWD, HOME, sevenSourceReaders());
  assert.equal(result.skills, 10);
  assert.equal(result.packages, 1);
});

test("scanEnv treats a root-level .md as a skill only for .pi-family sources", () => {
  const readers = makeReaders({
    dirs: {
      [`${AGENT}/skills`]: ["global.md"],
      [`${HOME}/.agents/skills`]: ["ignoredglobal.md"],
      [`${CWD}/.pi/skills`]: ["project.md"],
      [`${CWD}/.agents/skills`]: ["ignoredproject.md"],
    },
    files: [`${CWD}/.git`],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 2);
});

test("scanEnv goes by SKILL.md; a directory without one is not a skill", () => {
  const readers = makeReaders({
    dirs: {
      [`${AGENT}/skills`]: ["hollow/", "real/"],
      [`${AGENT}/skills/hollow`]: ["README.md", "notes.txt"],
      ...skillDir(`${AGENT}/skills/real`),
    },
    files: [`${CWD}/.git`],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 1);
});

test("scanEnv recurses into nested SKILL.md directories", () => {
  const readers = makeReaders({
    dirs: {
      [`${AGENT}/skills`]: ["group/"],
      [`${AGENT}/skills/group`]: ["inner/", "other/"],
      ...skillDir(`${AGENT}/skills/group/inner`),
      ...skillDir(`${AGENT}/skills/group/other`),
    },
    files: [`${CWD}/.git`],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 2);
});

test("scanEnv does not count subdirectories of a skill directory as skills", () => {
  const readers = makeReaders({
    dirs: {
      [`${AGENT}/skills`]: ["outer/"],
      [`${AGENT}/skills/outer`]: ["SKILL.md", "nested/"],
      ...skillDir(`${AGENT}/skills/outer/nested`),
    },
    files: [`${CWD}/.git`],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 1);
});

test("scanEnv dedupes by name; one skill in two sources counts once", () => {
  const readers = makeReaders({
    dirs: {
      [`${AGENT}/skills`]: ["alpha/", "shared/"],
      ...skillDir(`${AGENT}/skills/alpha`),
      ...skillDir(`${AGENT}/skills/shared`),
      [`${HOME}/.agents/skills`]: ["shared/", "beta/"],
      ...skillDir(`${HOME}/.agents/skills/shared`),
      ...skillDir(`${HOME}/.agents/skills/beta`),
    },
    files: [`${CWD}/.git`],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 3);
});

test("a failing skills source does not affect the others", () => {
  const base = sevenSourceReaders();
  const readers = sevenSourceReaders({
    listDir: (raw) => {
      if (norm(raw).startsWith(`${HOME}/.agents/skills`)) throw new Error("boom");
      return base.listDir(raw);
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 9);
});

test("an unreadable package.json falls back to scanning the skills directory, other sources unaffected", () => {
  const base = sevenSourceReaders();
  const readers = sevenSourceReaders({
    readJson: (raw) => {
      if (norm(raw).endsWith("/pkg/package.json")) throw new Error("boom");
      return base.readJson(raw);
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 10);
});

test("scanEnv ignores malformed pi.skills entries and scans the package's skills directory instead", () => {
  const base = sevenSourceReaders();
  const readers = sevenSourceReaders({
    readJson: (raw) => {
      if (norm(raw).endsWith("/pkg/package.json")) return { pi: { skills: "./skills" } };
      return base.readJson(raw);
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 10);
});

test("an uninstalled package does not zero the whole skill count", () => {
  const base = sevenSourceReaders();
  const readers = sevenSourceReaders({
    readJson: (raw) => {
      const path = norm(raw);
      if (path === `${AGENT}/settings.json`) {
        return {
          packages: ["npm:pkg", "npm:not-installed", "git:host/owner/repo"],
          skills: ["/base/extra/solo.md", "/base/extra/dir"],
        };
      }
      return base.readJson(raw);
    },
  });
  const result = scanEnv(AGENT, CWD, HOME, readers);
  assert.equal(result.packages, 3);
  assert.equal(result.skills, 10);
});

test("scanEnv finds the skills shipped by a git: package", () => {
  const readers = makeReaders({
    dirs: {
      [`${AGENT}/git/host/owner/repo/skills`]: ["fromgit/"],
      ...skillDir(`${AGENT}/git/host/owner/repo/skills/fromgit`),
    },
    files: [`${CWD}/.git`],
    json: {
      [`${AGENT}/settings.json`]: { packages: ["git:host/owner/repo"] },
      [`${AGENT}/git/host/owner/repo/package.json`]: { pi: { skills: ["./skills"] } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 1);
});

test("a package without pi.skills falls back to scanning its skills directory", () => {
  const readers = makeReaders({
    dirs: {
      [`${AGENT}/npm/node_modules/pkg/skills`]: ["bundled/"],
      ...skillDir(`${AGENT}/npm/node_modules/pkg/skills/bundled`),
    },
    files: [`${CWD}/.git`],
    json: {
      [`${AGENT}/settings.json`]: { packages: ["npm:pkg"] },
      [`${AGENT}/npm/node_modules/pkg/package.json`]: { pi: { extensions: ["./index.ts"] } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 1);
});

test("settings.skills accepts both files and directories", () => {
  const readers = makeReaders({
    dirs: {
      "/base/extra/dir": ["eta/"],
      ...skillDir("/base/extra/dir/eta"),
    },
    files: [`${CWD}/.git`, "/base/extra/solo.md"],
    json: {
      [`${AGENT}/settings.json`]: {
        skills: ["/base/extra/solo.md", "/base/extra/dir", "/base/extra/gone.md"],
      },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 2);
});

test(".pi/skills looks only at cwd and does not climb to ancestors", () => {
  const readers = makeReaders({
    dirs: {
      "/base/work/.pi/skills": ["ancestoronly/"],
      ...skillDir("/base/work/.pi/skills/ancestoronly"),
    },
    files: ["/base/.git"],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 0);
});

test("scanEnv counts MCP servers and packages", () => {
  const readers = makeReaders({
    files: [`${CWD}/.git`],
    json: {
      [`${AGENT}/mcp.json`]: { mcpServers: { a: {}, b: {}, c: {} } },
      [`${AGENT}/settings.json`]: { packages: ["npm:x", "npm:y"] },
    },
  });
  const result = scanEnv(AGENT, CWD, HOME, readers);
  assert.equal(result.mcps, 3);
  assert.equal(result.packages, 2);
});

test("scanEnv returns 0 on a read failure instead of throwing", () => {
  const boom = (): never => {
    throw new Error("boom");
  };
  const result = scanEnv(AGENT, CWD, HOME, {
    readJson: boom,
    readText: boom,
    exists: boom,
    listDir: boom,
  });
  assert.deepEqual(result, { agentsMd: 0, mcps: 0, packages: 0, extensions: 0, skills: 0 });
});

test("scanEnv returns 0 for malformed JSON", () => {
  const result = scanEnv(
    AGENT,
    CWD,
    HOME,
    makeReaders({
      json: { [`${AGENT}/mcp.json`]: "nonsense", [`${AGENT}/settings.json`]: "nonsense" },
      files: [`${CWD}/.git`],
    }),
  );
  assert.equal(result.mcps, 0);
  assert.equal(result.packages, 0);
  assert.equal(result.skills, 0);
});

test("AGENTS.md covers the agent directory and every ancestor of cwd", () => {
  const readers = makeReaders({
    files: [
      `${AGENT}/AGENTS.md`,
      `${CWD}/AGENTS.md`,
      "/base/work/CLAUDE.md",
      "/base/AGENTS.md",
      "/base/.git",
    ],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).agentsMd, 4);
});

test("AGENTS.md and CLAUDE.md at the same level count as one", () => {
  const readers = makeReaders({
    files: [`${CWD}/AGENTS.md`, `${CWD}/CLAUDE.md`, `${CWD}/.git`],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).agentsMd, 1);
});

test("AGENTS.override.md replaces AGENTS.md and CLAUDE.md at the same level", () => {
  const replaced = makeReaders({
    files: [`${CWD}/AGENTS.override.md`, `${CWD}/AGENTS.md`, `${CWD}/CLAUDE.md`, `${CWD}/.git`],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, replaced).agentsMd, 1);
  const alone = makeReaders({ files: [`${CWD}/AGENTS.override.md`, `${CWD}/.git`] });
  assert.equal(scanEnv(AGENT, CWD, HOME, alone).agentsMd, 1);
});

test("the AGENTS.md climb stops at the git repo root", () => {
  const readers = makeReaders({
    files: [`${CWD}/AGENTS.md`, `${CWD}/.git`, "/base/work/AGENTS.md", "/base/AGENTS.md"],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).agentsMd, 1);
});

test("the ancestor climb is capped at 30 levels", () => {
  const deep = `/${Array.from({ length: 60 }, (_, i) => `d${i}`).join("/")}`;
  const readers = makeReaders(
    {},
    { exists: (raw) => norm(raw).endsWith("/AGENTS.md") && !norm(raw).startsWith(AGENT) },
  );
  assert.equal(scanEnv(AGENT, deep, HOME, readers).agentsMd, 30);
});

test("a failed AGENTS.md probe does not affect the skill count", () => {
  const base = sevenSourceReaders();
  const readers = sevenSourceReaders({
    exists: (raw) => {
      if (/AGENTS|CLAUDE/.test(norm(raw))) throw new Error("boom");
      return base.exists(raw);
    },
  });
  const result = scanEnv(AGENT, CWD, HOME, readers);
  assert.equal(result.agentsMd, 0);
  assert.equal(result.skills, 10);
});

test("listDir marks a symlink pointing at a directory as a directory", () => {
  const base = mkdtempSync(join(tmpdir(), "hud-skills-"));
  try {
    const target = join(base, "target");
    mkdirSync(join(base, "skills"));
    mkdirSync(target);
    writeFileSync(join(base, "skills", "notes.md"), "x", "utf-8");
    mkdirSync(join(base, "skills", "plain"));
    symlinkSync(target, join(base, "skills", "linked"), "junction");
    const entries = listDir(join(base, "skills")).sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(entries, [
      { name: "linked", isDirectory: true },
      { name: "notes.md", isDirectory: false },
      { name: "plain", isDirectory: true },
    ]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("listDir treats a broken symlink as not a directory", () => {
  const base = mkdtempSync(join(tmpdir(), "hud-skills-"));
  try {
    mkdirSync(join(base, "skills"));
    const gone = join(base, "gone");
    mkdirSync(gone);
    symlinkSync(gone, join(base, "skills", "dangling"), "junction");
    rmSync(gone, { recursive: true, force: true });
    assert.deepEqual(listDir(join(base, "skills")), [{ name: "dangling", isDirectory: false }]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("FS_READERS provides the four readers scanEnv needs", () => {
  assert.equal(typeof FS_READERS.readJson, "function");
  assert.equal(typeof FS_READERS.readText, "function");
  assert.equal(typeof FS_READERS.exists, "function");
  assert.equal(FS_READERS.listDir, listDir);
});

test("FS_READERS.readText returns the file verbatim", () => {
  const base = mkdtempSync(join(tmpdir(), "hud-text-"));
  try {
    const file = join(base, "config.toml");
    writeFileSync(file, "[mcp_servers.demo]\n", "utf-8");
    assert.equal(FS_READERS.readText(file), "[mcp_servers.demo]\n");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

const CLAUDE_JSON = `${HOME}/.claude.json`;
const CODEX_TOML = `${HOME}/.codex/config.toml`;
const DESKTOP_JSON = `${HOME}/Library/Application Support/Claude/claude_desktop_config.json`;
const OPENCODE_JSON = `${HOME}/.config/opencode/opencode.json`;

const CODEX_SOURCE = [
  "[other]",
  'model = "x"',
  "[mcp_servers.node_repl]",
  'command = "node"',
  "[mcp_servers.node_repl.env]",
  'PATH = "/bin"',
  '[mcp_servers."codebase-memory-mcp"]',
  'command = "uvx"',
].join("\n");

function mcpReaders(spec: VfsSpec, over: Partial<EnvReaders> = {}): EnvReaders {
  return makeReaders({ ...spec, files: [`${CWD}/.git`, ...(spec.files ?? [])] }, over);
}

const sixSources = {
  [`${HOME}/.config/mcp/mcp.json`]: { mcpServers: { one: {} } },
  [`${HOME}/.agents/mcp.json`]: { mcpServers: { two: {} } },
  [`${HOME}/.agents/mcp/mcp.json`]: { mcpServers: { three: {} } },
  [`${CWD}/.mcp.json`]: { mcpServers: { four: {} } },
  [`${AGENT}/mcp.json`]: { mcpServers: { five: {} } },
  [`${CWD}/.pi/mcp.json`]: { mcpServers: { six: {} } },
};

test("all six MCP file sources are counted", () => {
  const readers = mcpReaders({ json: sixSources });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 6);
});

test("MCP servers are deduped by name", () => {
  const readers = mcpReaders({
    json: {
      [`${HOME}/.config/mcp/mcp.json`]: { mcpServers: { dup: {}, solo: {} } },
      [`${CWD}/.pi/mcp.json`]: { mcpServers: { dup: {} } },
      [`${AGENT}/mcp.json`]: { mcpServers: { dup: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 2);
});

test("a single failing MCP file source does not affect the others", () => {
  const base = mcpReaders({ json: sixSources });
  const readers = mcpReaders(
    { json: sixSources },
    {
      readJson: (raw) => {
        if (norm(raw) === `${HOME}/.agents/mcp.json`) throw new Error("boom");
        return base.readJson(raw);
      },
    },
  );
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 5);
});

test("with hostConfigDiscovery on, claude-code and codex imports are loaded", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: {
        mcpServers: { local: {} },
        imports: ["claude-code", "codex"],
        settings: { hostConfigDiscovery: "on" },
      },
      [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
    },
    text: { [CODEX_TOML]: CODEX_SOURCE },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 4);
});

for (const mode of ["off", "prompt"]) {
  test(`explicit imports still expand with hostConfigDiscovery ${mode}`, () => {
    const readers = mcpReaders({
      json: {
        [`${AGENT}/mcp.json`]: {
          mcpServers: { local: {} },
          imports: ["claude-code", "codex"],
          settings: { hostConfigDiscovery: mode },
        },
        [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
      },
      text: { [CODEX_TOML]: CODEX_SOURCE },
    });
    assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 4);
  });
}

test("explicit imports still expand when hostConfigDiscovery is absent", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { mcpServers: { local: {} }, imports: ["claude-code", "codex"] },
      [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
    },
    text: { [CODEX_TOML]: CODEX_SOURCE },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 4);
});

test("a non-agentDir config file's own imports are expanded", () => {
  const readers = mcpReaders({
    json: {
      [`${HOME}/.config/mcp/mcp.json`]: { mcpServers: { shared: {} }, imports: ["claude-code"] },
      [`${AGENT}/mcp.json`]: { mcpServers: { local: {} } },
      [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 3);
});

test("hostConfigDiscovery written in a non-agentDir config file is recognised", () => {
  const readers = mcpReaders({
    json: {
      [`${HOME}/.config/mcp/mcp.json`]: { settings: { hostConfigDiscovery: "on" } },
      [`${HOME}/.cursor/mcp.json`]: { mcpServers: { cursorserver: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("hostConfigDiscovery is overridden by a later config file", () => {
  const readers = mcpReaders({
    json: {
      [`${HOME}/.config/mcp/mcp.json`]: { settings: { hostConfigDiscovery: "on" } },
      [`${CWD}/.pi/mcp.json`]: {
        mcpServers: { six: {} },
        settings: { hostConfigDiscovery: "off" },
      },
      [`${HOME}/.cursor/mcp.json`]: { mcpServers: { cursorserver: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("with hostConfigDiscovery on, every host kind is discovered regardless of the imports list", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { mcpServers: { local: {} }, settings: { hostConfigDiscovery: "on" } },
      [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
      [`${HOME}/.cursor/mcp.json`]: { mcpServers: { cursorserver: {} } },
      [`${HOME}/.windsurf/mcp.json`]: { "mcp-servers": { windsurfserver: {} } },
      [`${CWD}/.vscode/mcp.json`]: { mcpServers: { vscodeserver: {} } },
      [DESKTOP_JSON]: { mcpServers: { deskserver: {} } },
      [OPENCODE_JSON]: { mcp: { opencodeserver: {}, disabled: { enabled: false } } },
    },
    text: { [CODEX_TOML]: CODEX_SOURCE },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 9);
});

test("host configs are not auto-discovered when hostConfigDiscovery is not on", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { mcpServers: { local: {} } },
      [`${HOME}/.cursor/mcp.json`]: { mcpServers: { cursorserver: {} } },
      [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("the claude-code import falls through the candidates in order", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { imports: ["claude-code"] },
      [`${HOME}/.claude/mcp.json`]: { mcpServers: { first: {} } },
      [CLAUDE_JSON]: { mcpServers: { second: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("the codex import falls back to config.json when the TOML is absent", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { imports: ["codex"] },
      [`${HOME}/.codex/config.json`]: { mcp_servers: { jsoncodex: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("the codex import accepts bare and quoted block names, and does not count sub-tables as servers", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { imports: ["codex"], settings: { hostConfigDiscovery: "on" } },
    },
    text: { [CODEX_TOML]: CODEX_SOURCE },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 2);
});

test("the codex import ignores comments, unnamed blocks and blocks with other prefixes", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { imports: ["codex"], settings: { hostConfigDiscovery: "on" } },
    },
    text: {
      [CODEX_TOML]: [
        "#[mcp_servers.commented]",
        "[mcp_servers]",
        "[other.mcp_servers.nested]",
        "[mcp_servers.real]",
      ].join("\n"),
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("a failed codex TOML read does not affect the claude-code import", () => {
  const readers = mcpReaders(
    {
      json: {
        [`${AGENT}/mcp.json`]: {
          imports: ["claude-code", "codex"],
          settings: { hostConfigDiscovery: "on" },
        },
        [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
      },
    },
    {
      readText: () => {
        throw new Error("boom");
      },
    },
  );
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("scanEnv parses every host config format listed in imports", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: {
        imports: ["cursor", "claude-desktop", "opencode", "vscode", "windsurf", "claude-code"],
      },
      [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
      [`${HOME}/.cursor/mcp.json`]: { mcpServers: { cursorserver: {} } },
      [`${HOME}/.windsurf/mcp.json`]: { "mcp-servers": { windsurfserver: {} } },
      [`${CWD}/.vscode/mcp.json`]: { mcpServers: { vscodeserver: {} } },
      [DESKTOP_JSON]: { mcpServers: { deskserver: {} } },
      [OPENCODE_JSON]: { mcp: { opencodeserver: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 6);
});

test("the opencode import skips servers with enabled false", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { imports: ["opencode"] },
      [OPENCODE_JSON]: { mcp: { live: {}, dead: { enabled: false } } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("a single failing host import does not affect the others", () => {
  const readers = mcpReaders(
    {
      json: {
        [`${AGENT}/mcp.json`]: { imports: ["cursor", "claude-code"] },
        [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
      },
    },
    {
      readJson: (raw) => {
        if (norm(raw) === `${HOME}/.cursor/mcp.json`) throw new Error("boom");
        if (norm(raw) === `${AGENT}/mcp.json`) {
          return { imports: ["cursor", "claude-code"] };
        }
        if (norm(raw) === CLAUDE_JSON) return { mcpServers: { canvas: {} } };
        throw new Error("missing");
      },
    },
  );
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("packages from the project-level .pi/settings.json are counted", () => {
  const readers = mcpReaders({
    dirs: {
      [`${CWD}/.pi/npm/node_modules/projpkg/skills`]: ["projskill/"],
      ...skillDir(`${CWD}/.pi/npm/node_modules/projpkg/skills/projskill`),
    },
    json: {
      [`${CWD}/.pi/settings.json`]: { packages: ["npm:projpkg"] },
      [`${CWD}/.pi/npm/node_modules/projpkg/package.json`]: {
        name: "projpkg",
        pi: { mcp: "./mcp.json" },
      },
      [`${CWD}/.pi/npm/node_modules/projpkg/mcp.json`]: { mcpServers: { pmcp: {} } },
    },
  });
  const result = scanEnv(AGENT, CWD, HOME, readers);
  assert.equal(result.mcps, 1);
  assert.equal(result.packages, 1);
  assert.equal(result.skills, 1);
});

test("project-level and user-level packages are both counted, with the same spec counted once", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/settings.json`]: { packages: ["npm:shared", "npm:userpkg"] },
      [`${CWD}/.pi/settings.json`]: { packages: ["npm:shared", "npm:projpkg"] },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).packages, 3);
});

test("user-level packages are still counted when the project-level settings.json is unreadable", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/settings.json`]: { packages: ["npm:pkg"] },
      [`${AGENT}/npm/node_modules/pkg/package.json`]: { name: "pkg", pi: { mcp: "./mcp.json" } },
      [`${AGENT}/npm/node_modules/pkg/mcp.json`]: { mcpServers: { umcp: {} } },
    },
  });
  const result = scanEnv(AGENT, CWD, HOME, readers);
  assert.equal(result.packages, 1);
  assert.equal(result.mcps, 1);
});

test("a package's pi.mcp server names are prefixed with the sanitised package name", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/settings.json`]: { packages: ["npm:@acme/tools"] },
      [`${AGENT}/npm/node_modules/@acme/tools/package.json`]: {
        name: "@acme/tools",
        pi: { mcp: "./mcp.json" },
      },
      [`${AGENT}/npm/node_modules/@acme/tools/mcp.json`]: { mcpServers: { docs: {} } },
      [`${HOME}/.config/mcp/mcp.json`]: { mcpServers: { docs: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 2);
});

test("an unreadable single pi.mcp file still leaves the package's other files counted", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/settings.json`]: { packages: ["npm:pkg"] },
      [`${AGENT}/npm/node_modules/pkg/package.json`]: {
        name: "pkg",
        pi: { mcp: ["./gone.json", "./b.json"] },
      },
      [`${AGENT}/npm/node_modules/pkg/b.json`]: { mcpServers: { beta: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("a package's pi.mcp string array is accepted, and its settings and imports are ignored", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/settings.json`]: { packages: ["npm:pkg", "npm:broken"] },
      [`${AGENT}/npm/node_modules/pkg/package.json`]: {
        name: "pkg",
        pi: { mcp: ["./a.json", "./b.json"] },
      },
      [`${AGENT}/npm/node_modules/pkg/a.json`]: {
        mcpServers: { alpha: {} },
        imports: ["claude-code"],
        settings: { hostConfigDiscovery: "on" },
      },
      [`${AGENT}/npm/node_modules/pkg/b.json`]: { mcpServers: { beta: {} } },
      [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 2);
});
