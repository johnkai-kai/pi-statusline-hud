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

test("scanEnv 七個 skills 來源都被計入", () => {
  const result = scanEnv(AGENT, CWD, HOME, sevenSourceReaders());
  assert.equal(result.skills, 10);
  assert.equal(result.packages, 1);
});

test("scanEnv 只在 .pi 系來源把根層 .md 當成 skill", () => {
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

test("scanEnv 以 SKILL.md 為準,沒有 SKILL.md 的目錄不算 skill", () => {
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

test("scanEnv 遞迴探索巢狀的 SKILL.md 目錄", () => {
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

test("scanEnv 不把 skill 目錄底下的子目錄再算成 skill", () => {
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

test("scanEnv 以名稱去重,同一個 skill 出現在兩個來源只算一次", () => {
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

test("scanEnv 單一 skills 來源讀取失敗不影響其他來源", () => {
  const base = sevenSourceReaders();
  const readers = sevenSourceReaders({
    listDir: (raw) => {
      if (norm(raw).startsWith(`${HOME}/.agents/skills`)) throw new Error("boom");
      return base.listDir(raw);
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 9);
});

test("scanEnv 套件的 package.json 讀不到時退回掃 skills 目錄且其他來源不受影響", () => {
  const base = sevenSourceReaders();
  const readers = sevenSourceReaders({
    readJson: (raw) => {
      if (norm(raw).endsWith("/pkg/package.json")) throw new Error("boom");
      return base.readJson(raw);
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 10);
});

test("scanEnv 忽略 pi.skills 中形狀不符的項目,改掃套件的 skills 目錄", () => {
  const base = sevenSourceReaders();
  const readers = sevenSourceReaders({
    readJson: (raw) => {
      if (norm(raw).endsWith("/pkg/package.json")) return { pi: { skills: "./skills" } };
      return base.readJson(raw);
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 10);
});

test("scanEnv 對未安裝的套件不會把整體 skills 歸零", () => {
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

test("scanEnv 掃得到 git: 套件帶的 skills", () => {
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

test("scanEnv 對沒有 pi.skills 的套件退回掃它的 skills 目錄", () => {
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

test("scanEnv 的 settings.skills 同時吃檔案與目錄", () => {
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

test("scanEnv 的 .pi/skills 只看 cwd,不爬祖先目錄", () => {
  const readers = makeReaders({
    dirs: {
      "/base/work/.pi/skills": ["ancestoronly/"],
      ...skillDir("/base/work/.pi/skills/ancestoronly"),
    },
    files: ["/base/.git"],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).skills, 0);
});

test("scanEnv 數出 MCP server 與套件數", () => {
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

test("scanEnv 對讀取失敗回傳 0 而非拋例外", () => {
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

test("scanEnv 對形狀不符的 JSON 回傳 0", () => {
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

test("scanEnv 的 AGENTS.md 涵蓋 agent 目錄與 cwd 各祖先", () => {
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

test("scanEnv 的同一層同時有 AGENTS.md 與 CLAUDE.md 只算一份", () => {
  const readers = makeReaders({
    files: [`${CWD}/AGENTS.md`, `${CWD}/CLAUDE.md`, `${CWD}/.git`],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).agentsMd, 1);
});

test("scanEnv 的 AGENTS.override.md 取代同層的 AGENTS.md 與 CLAUDE.md", () => {
  const replaced = makeReaders({
    files: [`${CWD}/AGENTS.override.md`, `${CWD}/AGENTS.md`, `${CWD}/CLAUDE.md`, `${CWD}/.git`],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, replaced).agentsMd, 1);
  const alone = makeReaders({ files: [`${CWD}/AGENTS.override.md`, `${CWD}/.git`] });
  assert.equal(scanEnv(AGENT, CWD, HOME, alone).agentsMd, 1);
});

test("scanEnv 的 AGENTS.md 爬到 git repo root 就停", () => {
  const readers = makeReaders({
    files: [`${CWD}/AGENTS.md`, `${CWD}/.git`, "/base/work/AGENTS.md", "/base/AGENTS.md"],
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).agentsMd, 1);
});

test("scanEnv 的祖先爬升有 30 層上限", () => {
  const deep = `/${Array.from({ length: 60 }, (_, i) => `d${i}`).join("/")}`;
  const readers = makeReaders(
    {},
    { exists: (raw) => norm(raw).endsWith("/AGENTS.md") && !norm(raw).startsWith(AGENT) },
  );
  assert.equal(scanEnv(AGENT, deep, HOME, readers).agentsMd, 30);
});

test("scanEnv 的 AGENTS.md 探測失敗不影響 skills 計數", () => {
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

test("listDir 把指向目錄的符號連結標記為目錄", () => {
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

test("listDir 把斷掉的符號連結當成非目錄", () => {
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

test("FS_READERS 提供 scanEnv 需要的四個讀取器", () => {
  assert.equal(typeof FS_READERS.readJson, "function");
  assert.equal(typeof FS_READERS.readText, "function");
  assert.equal(typeof FS_READERS.exists, "function");
  assert.equal(FS_READERS.listDir, listDir);
});

test("FS_READERS.readText 讀回檔案原文", () => {
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

test("scanEnv 的 MCP 六個檔案來源都被計入", () => {
  const readers = mcpReaders({ json: sixSources });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 6);
});

test("scanEnv 的 MCP 以伺服器名稱去重", () => {
  const readers = mcpReaders({
    json: {
      [`${HOME}/.config/mcp/mcp.json`]: { mcpServers: { dup: {}, solo: {} } },
      [`${CWD}/.pi/mcp.json`]: { mcpServers: { dup: {} } },
      [`${AGENT}/mcp.json`]: { mcpServers: { dup: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 2);
});

test("scanEnv 的 MCP 單一檔案來源失敗不影響其他來源", () => {
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

test("scanEnv 在 hostConfigDiscovery 為 on 時載入 claude-code 與 codex 匯入", () => {
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
  test(`scanEnv 在 hostConfigDiscovery 為 ${mode} 時仍展開顯式 imports`, () => {
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

test("scanEnv 缺少 hostConfigDiscovery 時仍展開顯式 imports", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { mcpServers: { local: {} }, imports: ["claude-code", "codex"] },
      [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
    },
    text: { [CODEX_TOML]: CODEX_SOURCE },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 4);
});

test("scanEnv 展開非 agentDir 設定檔自己的 imports", () => {
  const readers = mcpReaders({
    json: {
      [`${HOME}/.config/mcp/mcp.json`]: { mcpServers: { shared: {} }, imports: ["claude-code"] },
      [`${AGENT}/mcp.json`]: { mcpServers: { local: {} } },
      [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 3);
});

test("scanEnv 認得寫在非 agentDir 設定檔的 hostConfigDiscovery", () => {
  const readers = mcpReaders({
    json: {
      [`${HOME}/.config/mcp/mcp.json`]: { settings: { hostConfigDiscovery: "on" } },
      [`${HOME}/.cursor/mcp.json`]: { mcpServers: { cursorserver: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("scanEnv 的 hostConfigDiscovery 由順序較後的設定檔覆寫", () => {
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

test("scanEnv 在 hostConfigDiscovery 為 on 時探索全部 host 種類,不看 imports 清單", () => {
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

test("scanEnv 在 hostConfigDiscovery 非 on 時不自動探索 host 設定", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { mcpServers: { local: {} } },
      [`${HOME}/.cursor/mcp.json`]: { mcpServers: { cursorserver: {} } },
      [CLAUDE_JSON]: { mcpServers: { canvas: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("scanEnv 的 claude-code 匯入依序退回下一個候選檔", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { imports: ["claude-code"] },
      [`${HOME}/.claude/mcp.json`]: { mcpServers: { first: {} } },
      [CLAUDE_JSON]: { mcpServers: { second: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("scanEnv 的 codex 匯入在 TOML 缺席時退回 config.json", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { imports: ["codex"] },
      [`${HOME}/.codex/config.json`]: { mcp_servers: { jsoncodex: {} } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("scanEnv 的 codex 匯入吃裸區塊名與引號區塊名,且不把子表算成伺服器", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { imports: ["codex"], settings: { hostConfigDiscovery: "on" } },
    },
    text: { [CODEX_TOML]: CODEX_SOURCE },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 2);
});

test("scanEnv 的 codex 匯入忽略註解、無名區塊與其他前綴的區塊", () => {
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

test("scanEnv 的 codex TOML 讀取失敗不影響 claude-code 匯入", () => {
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

test("scanEnv 解析 imports 列出的每一種 host 設定格式", () => {
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

test("scanEnv 的 opencode 匯入略過 enabled 為 false 的伺服器", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/mcp.json`]: { imports: ["opencode"] },
      [OPENCODE_JSON]: { mcp: { live: {}, dead: { enabled: false } } },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).mcps, 1);
});

test("scanEnv 單一 host 匯入失敗不影響其他匯入", () => {
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

test("scanEnv 計入專案層 .pi/settings.json 的套件", () => {
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

test("scanEnv 同時計入專案層與使用者層的套件,同名 spec 只算一個", () => {
  const readers = mcpReaders({
    json: {
      [`${AGENT}/settings.json`]: { packages: ["npm:shared", "npm:userpkg"] },
      [`${CWD}/.pi/settings.json`]: { packages: ["npm:shared", "npm:projpkg"] },
    },
  });
  assert.equal(scanEnv(AGENT, CWD, HOME, readers).packages, 3);
});

test("scanEnv 讀不到專案層 settings.json 時使用者層套件照常計入", () => {
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

test("scanEnv 把套件的 pi.mcp 伺服器名加上消毒後的套件名前綴", () => {
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

test("scanEnv 的套件 pi.mcp 單一檔案讀不到時其餘檔案仍被計入", () => {
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

test("scanEnv 吃套件 pi.mcp 的字串陣列並忽略套件檔的 settings 與 imports", () => {
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
