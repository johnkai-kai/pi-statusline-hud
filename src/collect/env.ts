import { basename, dirname, join } from "node:path";

export interface EnvCounts {
  agentsMd: number;
  mcps: number;
  packages: number;
  extensions: number;
  skills: number;
}

/** All five counts equal. Used to skip a repaint after a scan that changed nothing. */
export function sameCounts(a: EnvCounts, b: EnvCounts): boolean {
  return (
    a.agentsMd === b.agentsMd &&
    a.mcps === b.mcps &&
    a.packages === b.packages &&
    a.extensions === b.extensions &&
    a.skills === b.skills
  );
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface EnvReaders {
  readJson(path: string): unknown;
  readText(path: string): string;
  exists(path: string): boolean;
  listDir(path: string): DirEntry[];
}

const EMPTY: EnvCounts = { agentsMd: 0, mcps: 0, packages: 0, extensions: 0, skills: 0 };
const NPM_PREFIX = "npm:";
const GIT_PREFIX = "git:";
const SKILL_FILE = "SKILL.md";
const MD_SUFFIX = ".md";
const MAX_ANCESTORS = 30;
const MAX_SKILL_DEPTH = 6;
const HOST_DISCOVERY_ON = "on";
const PKG_SEPARATOR = "__";
// Only the first key segment of [mcp_servers.<name>]; sub-tables (.env, say) are not servers.
const TOML_SERVER_TABLE = /^[ \t]*\[\[?[ \t]*mcp_servers[ \t]*\.[ \t]*(?:"([^"]+)"|'([^']+)'|([^.\s\]"']+))/gm;
const AGENTS_OVERRIDE = "AGENTS.override.md";
const AGENTS_NAMES = ["AGENTS.md", "CLAUDE.md"];

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function strings(value: unknown, key: string): string[] {
  const list = field(value, key);
  return Array.isArray(list) ? list.filter((s): s is string => typeof s === "string") : [];
}

export function packageRoot(baseDir: string, spec: string): string | null {
  if (spec.startsWith(NPM_PREFIX)) {
    const name = spec.slice(NPM_PREFIX.length);
    return name.length > 0 ? join(baseDir, "npm", "node_modules", ...name.split("/")) : null;
  }
  if (spec.startsWith(GIT_PREFIX)) {
    const rest = spec.slice(GIT_PREFIX.length);
    return rest.length > 0 ? join(baseDir, "git", ...rest.split("/")) : null;
  }
  return null;
}

// pi has two package sources: project level <cwd>/.pi/settings.json first, then user level
// <agentDir>/settings.json, each resolved against its own directory. pkgs dedupe by spec
// string; scans dedupe by resolved root directory.
function packageSources(
  projectSettings: unknown,
  userSettings: unknown,
  agentDir: string,
  cwd: string,
): { roots: string[]; count: number } {
  const roots: string[] = [];
  const specs = new Set<string>();
  const scopes: Array<[unknown, string]> = [
    [projectSettings, join(cwd, ".pi")],
    [userSettings, agentDir],
  ];
  for (const [settings, baseDir] of scopes) {
    for (const spec of strings(settings, "packages")) {
      specs.add(spec);
      const root = packageRoot(baseDir, spec);
      if (root !== null && !roots.includes(root)) roots.push(root);
    }
  }
  return { roots, count: specs.size };
}

const EXT_SUFFIXES = [".ts", ".js"];

function isExtFile(name: string): boolean {
  return EXT_SUFFIXES.some((s) => name.endsWith(s));
}

/**
 * Counts the extensions pi actually loads, not the entries in settings.packages — they
 * differ: some packages register no extension, and standalone files under
 * <agentDir>/extensions/ are extensions that belong to no package. pi's /context panel
 * lists the latter.
 *
 * Directory conventions are in pi's own docs/extensions.md: extensions/*.ts and
 * extensions/{name}/index.ts.
 */
function scanExtensions(
  agentDir: string,
  cwd: string,
  packageRoots: string[],
  readers: EnvReaders,
): number {
  const found = new Set<string>();

  const scanDir = (dir: string): void => {
    for (const entry of readers.listDir(dir)) {
      if (entry.isDirectory) {
        const index = join(dir, entry.name, "index.ts");
        const indexJs = join(dir, entry.name, "index.js");
        if (safe(() => readers.exists(index) || readers.exists(indexJs), false)) {
          found.add(join(dir, entry.name));
        }
      } else if (isExtFile(entry.name)) {
        found.add(join(dir, entry.name));
      }
    }
  };

  for (const dir of [join(agentDir, "extensions"), join(cwd, ".pi", "extensions")]) {
    safe(() => scanDir(dir), undefined);
  }

  for (const root of packageRoots) {
    safe(() => {
      const manifest = readers.readJson(join(root, "package.json"));
      const declared = strings(field(manifest, "pi"), "extensions");
      if (declared.length > 0) {
        // A package is one entry in pi's list even when it declares several entry points.
        found.add(root);
        return;
      }
      const conventional = readers.listDir(join(root, "extensions"));
      if (conventional.some((e) => !e.isDirectory && isExtFile(e.name))) found.add(root);
    }, undefined);
  }

  return found.size;
}

function ancestors(cwd: string, readers: EnvReaders): string[] {
  const chain: string[] = [];
  let dir = cwd;
  for (let level = 0; level < MAX_ANCESTORS; level += 1) {
    chain.push(dir);
    if (safe(() => readers.exists(join(dir, ".git")), false)) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return chain;
}

function walkSkills(dir: string, readers: EnvReaders, names: Set<string>, depth: number): void {
  if (depth > MAX_SKILL_DEPTH) return;
  const entries = safe(() => readers.listDir(dir), null);
  if (entries === null) return;
  if (entries.some((entry) => !entry.isDirectory && entry.name === SKILL_FILE)) {
    names.add(basename(dir));
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory) walkSkills(join(dir, entry.name), readers, names, depth + 1);
  }
}

function collectSource(
  dir: string,
  readers: EnvReaders,
  names: Set<string>,
  rootMarkdown: boolean,
): void {
  const entries = safe(() => readers.listDir(dir), null);
  if (entries === null) return;
  if (entries.some((entry) => !entry.isDirectory && entry.name === SKILL_FILE)) {
    names.add(basename(dir));
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory) walkSkills(join(dir, entry.name), readers, names, 1);
    else if (rootMarkdown && entry.name.endsWith(MD_SUFFIX)) {
      names.add(entry.name.slice(0, -MD_SUFFIX.length));
    }
  }
}

function collectPackageSkills(roots: string[], readers: EnvReaders, names: Set<string>): void {
  for (const root of roots) {
    const declared = strings(safe(() => field(readers.readJson(join(root, "package.json")), "pi"), undefined), "skills");
    const dirs = declared.length > 0 ? declared : ["skills"];
    for (const rel of dirs) collectSource(join(root, rel), readers, names, false);
  }
}

function collectSettingsSkills(settings: unknown, readers: EnvReaders, names: Set<string>): void {
  for (const entry of strings(settings, "skills")) {
    if (entry.endsWith(MD_SUFFIX)) {
      if (safe(() => readers.exists(entry), false)) {
        names.add(basename(entry).slice(0, -MD_SUFFIX.length));
      }
      continue;
    }
    collectSource(entry, readers, names, true);
  }
}

function scanSkills(
  agentDir: string,
  cwd: string,
  home: string,
  settings: unknown,
  packageRoots: string[],
  readers: EnvReaders,
): number {
  const names = new Set<string>();
  const sources: Array<() => void> = [
    () => collectSource(join(agentDir, "skills"), readers, names, true),
    () => collectSource(join(home, ".agents", "skills"), readers, names, false),
    () => collectSource(join(cwd, ".pi", "skills"), readers, names, true),
    () => {
      for (const dir of ancestors(cwd, readers)) {
        collectSource(join(dir, ".agents", "skills"), readers, names, false);
      }
    },
    () => collectPackageSkills(packageRoots, readers, names),
    () => collectSettingsSkills(settings, readers, names),
  ];
  for (const source of sources) safe(source, undefined);
  return names.size;
}

function namedServers(config: unknown, keys: string[]): string[] {
  for (const key of keys) {
    const servers = field(config, key);
    if (typeof servers === "object" && servers !== null) return Object.keys(servers);
  }
  return [];
}

function serverNames(config: unknown): string[] {
  return namedServers(config, ["mcpServers"]);
}

function tomlServerNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(TOML_SERVER_TABLE)) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name !== undefined && name.length > 0) names.push(name);
  }
  return names;
}

interface ImportContext {
  home: string;
  cwd: string;
  readers: EnvReaders;
}

// Try the candidates in order; the first one that reads wins (pi's own rule).
function firstCandidate(loaders: Array<() => string[]>): string[] {
  for (const load of loaders) {
    const names = safe<string[] | null>(load, null);
    if (names !== null) return names;
  }
  return [];
}

function jsonHost(ctx: ImportContext, path: string, keys: string[]): string[] {
  return namedServers(ctx.readers.readJson(path), keys);
}

function opencodeServers(config: unknown): string[] {
  const servers = field(config, "mcp");
  if (typeof servers !== "object" || servers === null) return [];
  return Object.entries(servers as Record<string, unknown>)
    .filter(([, entry]) => field(entry, "enabled") !== false)
    .map(([name]) => name);
}

const MCP_KEYS = ["mcpServers", "mcp-servers"];

// opencode only reads the user-level ~/.config/opencode/opencode.json. pi has a second
// candidate, ./opencode.json relative to the git root; supporting it would mean a second
// copy of git-root detection, so servers in that file are undercounted.
const HOST_IMPORTS: Record<string, (ctx: ImportContext) => string[]> = {
  "claude-code": (ctx) =>
    firstCandidate([
      () => jsonHost(ctx, join(ctx.home, ".claude", "mcp.json"), ["mcpServers"]),
      () => jsonHost(ctx, join(ctx.home, ".claude.json"), ["mcpServers"]),
      () => jsonHost(ctx, join(ctx.home, ".claude", "claude_desktop_config.json"), ["mcpServers"]),
    ]),
  codex: (ctx) =>
    firstCandidate([
      () => tomlServerNames(ctx.readers.readText(join(ctx.home, ".codex", "config.toml"))),
      () =>
        jsonHost(ctx, join(ctx.home, ".codex", "config.json"), ["mcp_servers", "mcpServers"]),
    ]),
  cursor: (ctx) => jsonHost(ctx, join(ctx.home, ".cursor", "mcp.json"), MCP_KEYS),
  "claude-desktop": (ctx) =>
    jsonHost(
      ctx,
      join(ctx.home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      ["mcpServers"],
    ),
  opencode: (ctx) =>
    opencodeServers(ctx.readers.readJson(join(ctx.home, ".config", "opencode", "opencode.json"))),
  vscode: (ctx) => jsonHost(ctx, join(ctx.cwd, ".vscode", "mcp.json"), MCP_KEYS),
  windsurf: (ctx) => jsonHost(ctx, join(ctx.home, ".windsurf", "mcp.json"), MCP_KEYS),
};

function addHost(kind: string, ctx: ImportContext, names: Set<string>): void {
  const load = HOST_IMPORTS[kind];
  if (load === undefined) return;
  safe(() => {
    for (const name of load(ctx)) names.add(name);
  }, undefined);
}

// Explicit imports always expand: pi's expandImports does not consult settings.
function collectImports(config: unknown, ctx: ImportContext, names: Set<string>): void {
  for (const kind of strings(config, "imports")) addHost(kind, ctx, names);
}

// With hostConfigDiscovery "on", pi discovers every host kind as well, imports aside.
function collectDiscoveredHosts(ctx: ImportContext, names: Set<string>): void {
  for (const kind of Object.keys(HOST_IMPORTS)) addHost(kind, ctx, names);
}

function sanitizePackageName(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function collectPackageMcps(roots: string[], readers: EnvReaders, names: Set<string>): void {
  for (const root of roots) {
    safe(() => {
      const manifest = readers.readJson(join(root, "package.json"));
      const declared = field(field(manifest, "pi"), "mcp");
      const files =
        typeof declared === "string"
          ? [declared]
          : Array.isArray(declared)
            ? declared.filter((entry): entry is string => typeof entry === "string")
            : [];
      const name = field(manifest, "name");
      const prefix = `${sanitizePackageName(typeof name === "string" ? name : basename(root))}${PKG_SEPARATOR}`;
      for (const rel of files) {
        safe(() => {
          for (const server of serverNames(readers.readJson(join(root, rel)))) {
            names.add(prefix + server);
          }
        }, undefined);
      }
    }, undefined);
  }
}

// Six config files in pi's source order; settings merge file by file (later wins), while
// imports expand independently per file.
function mcpConfigPaths(agentDir: string, cwd: string, home: string): string[] {
  return [
    join(home, ".config", "mcp", "mcp.json"),
    join(home, ".agents", "mcp.json"),
    join(home, ".agents", "mcp", "mcp.json"),
    join(agentDir, "mcp.json"),
    join(cwd, ".mcp.json"),
    join(cwd, ".pi", "mcp.json"),
  ];
}

function scanMcps(
  agentDir: string,
  cwd: string,
  home: string,
  packageRoots: string[],
  readers: EnvReaders,
): number {
  const names = new Set<string>();
  const ctx: ImportContext = { home, cwd, readers };
  const configs = mcpConfigPaths(agentDir, cwd, home).map((path) =>
    safe(() => readers.readJson(path), undefined),
  );
  let discovery: unknown;
  for (const config of configs) {
    const value = field(field(config, "settings"), "hostConfigDiscovery");
    if (value !== undefined) discovery = value;
  }
  const sources: Array<() => void> = [
    ...configs.map((config) => () => {
      for (const name of serverNames(config)) names.add(name);
    }),
    ...configs.map((config) => () => collectImports(config, ctx, names)),
    () => {
      if (discovery === HOST_DISCOVERY_ON) collectDiscoveredHosts(ctx, names);
    },
    () => collectPackageMcps(packageRoots, readers, names),
  ];
  for (const source of sources) safe(source, undefined);
  return names.size;
}

function hasAgentsDoc(dir: string, readers: EnvReaders): boolean {
  if (safe(() => readers.exists(join(dir, AGENTS_OVERRIDE)), false)) return true;
  return AGENTS_NAMES.some((name) => safe(() => readers.exists(join(dir, name)), false));
}

function scanAgentsMd(agentDir: string, cwd: string, readers: EnvReaders): number {
  let total = safe(() => (readers.exists(join(agentDir, "AGENTS.md")) ? 1 : 0), 0);
  for (const dir of ancestors(cwd, readers)) {
    if (hasAgentsDoc(dir, readers)) total += 1;
  }
  return total;
}

export function scanEnv(
  agentDir: string,
  cwd: string,
  home: string,
  readers: EnvReaders,
): EnvCounts {
  const settings = safe(() => readers.readJson(join(agentDir, "settings.json")), undefined);
  const projectSettings = safe(
    () => readers.readJson(join(cwd, ".pi", "settings.json")),
    undefined,
  );
  const packages = safe(
    () => packageSources(projectSettings, settings, agentDir, cwd),
    { roots: [], count: 0 },
  );
  return {
    ...EMPTY,
    agentsMd: safe(() => scanAgentsMd(agentDir, cwd, readers), 0),
    mcps: safe(() => scanMcps(agentDir, cwd, home, packages.roots, readers), 0),
    packages: packages.count,
    extensions: safe(() => scanExtensions(agentDir, cwd, packages.roots, readers), 0),
    skills: safe(() => scanSkills(agentDir, cwd, home, settings, packages.roots, readers), 0),
  };
}
