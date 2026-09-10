import {
  DefaultPackageManager,
  hasTrustRequiringProjectResources,
  ProjectTrustStore,
  SettingsManager,
  type ResolvedPaths,
} from "@earendil-works/pi-coding-agent";
import { scanEnv, type EnvCounts, type EnvReaders } from "./env.ts";

export interface ResolvedEnvCounts extends EnvCounts {
  /** Installed package roots, suitable for package-owned MCP discovery. */
  packageRoots: string[];
}

interface SettingsStorage {
  withLock(scope: "global" | "project", fn: (current: string | undefined) => string | undefined): void;
}

interface ConfiguredPackage {
  source: string;
  scope: "user" | "project";
  filtered: boolean;
  installedPath?: string;
}

function safeJson(readers: EnvReaders, path: string): unknown {
  try {
    return readers.readJson(path);
  } catch {
    return {};
  }
}

function settingsText(value: unknown): string {
  return JSON.stringify(value && typeof value === "object" ? value : {});
}

function storageFor(
  userSettings: unknown,
  projectSettings: unknown,
): SettingsStorage {
  const values = {
    global: settingsText(userSettings),
    project: settingsText(projectSettings),
  };
  return {
    withLock(scope, fn) {
      // The callback is intentionally never persisted. SettingsManager only reads this
      // storage during construction; package resolution must not write user settings.
      fn(values[scope]);
    },
  };
}

function configuredPackages(manager: DefaultPackageManager): ConfiguredPackage[] {
  try {
    return manager.listConfiguredPackages();
  } catch {
    return [];
  }
}

function packageRoots(packages: ConfiguredPackage[]): string[] {
  return [...new Set(packages.flatMap((pkg) => (pkg.installedPath ? [pkg.installedPath] : [])))];
}

function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function resolveTrust(cwd: string, agentDir: string): boolean {
  const needsTrust = safeCall(() => hasTrustRequiringProjectResources(cwd), false);
  if (!needsTrust) return true;
  return safeCall(() => new ProjectTrustStore(agentDir).get(cwd) === true, false);
}

function resourceCount(paths: ResolvedPaths, key: "extensions" | "skills"): number {
  // ResolvedPaths deliberately retains disabled entries. The HUD describes configured
  // inventory, so disabled resources still count.
  return paths[key].length;
}

/**
 * Resolve the same package/resource inventory pi sees without loading extensions or
 * installing missing packages. Missing npm/git sources are answered with "skip".
 */
export async function scanResolvedEnv(
  agentDir: string,
  cwd: string,
  home: string,
  readers: EnvReaders,
): Promise<ResolvedEnvCounts> {
  const userSettings = safeJson(readers, `${agentDir}/settings.json`);
  const projectSettings = safeJson(readers, `${cwd}/.pi/settings.json`);
  const projectTrusted = resolveTrust(cwd, agentDir);
  const settingsManager = SettingsManager.fromStorage(
    storageFor(userSettings, projectSettings),
    { projectTrusted },
  );
  const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
  const resolved: ResolvedPaths = await manager.resolve(async () => "skip");
  const packages = configuredPackages(manager);
  const roots = packageRoots(packages);
  const base = scanEnv(
    agentDir,
    cwd,
    home,
    readers,
    roots,
  );
  return {
    ...base,
    packages: packages.length,
    extensions: resourceCount(resolved, "extensions"),
    skills: resourceCount(resolved, "skills"),
    packageRoots: roots,
  };
}
