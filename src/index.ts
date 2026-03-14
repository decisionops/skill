import fs from "node:fs";
import path from "node:path";
import * as TOML from "@iarna/toml";

export const SKILL_NAME = "decision-ops";
export const SKILL_DIR = path.join(import.meta.dir, "..", "decision-ops");
export const PLATFORMS_DIR = path.join(import.meta.dir, "..", "platforms");

export type PlatformInstallSpec = {
  supported?: boolean;
  build_path?: string;
  install_path_env?: string;
  install_path_default?: string;
  install_root_env?: string;
  install_root_default?: string;
  install_path_suffix?: string;
  scope?: "user" | "project";
  format?: "codex_toml" | "json_map";
  root_key?: string;
};

export type PlatformAuthSpec = {
  mode?: string;
  instructions?: string[];
};

export type PlatformDefinition = {
  id: string;
  display_name: string;
  skill?: PlatformInstallSpec;
  mcp?: PlatformInstallSpec;
  manifest?: PlatformInstallSpec;
  auth?: PlatformAuthSpec;
  __file__: string;
};

export function loadPlatforms(platformsDir = PLATFORMS_DIR): Record<string, PlatformDefinition> {
  const platforms: Record<string, PlatformDefinition> = {};
  for (const entry of fs.readdirSync(platformsDir)) {
    if (!entry.endsWith(".toml")) continue;
    const filePath = path.join(platformsDir, entry);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = TOML.parse(raw) as Omit<PlatformDefinition, "__file__">;
    if (!parsed.id) throw new Error(`Platform file missing id: ${filePath}`);
    if (parsed.id !== path.basename(entry, ".toml")) {
      throw new Error(`Platform id '${parsed.id}' must match filename '${path.basename(entry, ".toml")}': ${filePath}`);
    }
    platforms[parsed.id] = { ...parsed, __file__: filePath };
  }
  if (Object.keys(platforms).length === 0) {
    throw new Error(`No platform definitions found in ${platformsDir}`);
  }
  return platforms;
}

export function selectPlatforms(
  platforms: Record<string, PlatformDefinition>,
  selectedIds?: string[],
  capability?: "skill" | "mcp" | "manifest",
): PlatformDefinition[] {
  const orderedIds = selectedIds && selectedIds.length > 0 ? selectedIds : Object.keys(platforms);
  const missing = orderedIds.filter((id) => !platforms[id]);
  if (missing.length > 0) throw new Error(`Unknown platform(s): ${missing.join(", ")}`);
  return orderedIds
    .map((id) => platforms[id])
    .filter((p) => !capability || Boolean(p[capability]?.supported));
}

export function expandHome(input: string): string {
  if (!input.startsWith("~")) return input;
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) return input;
  if (input === "~") return home;
  if (input.startsWith("~/") || input.startsWith("~\\")) return path.join(home, input.slice(2));
  return input;
}

export function formatTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
    if (!(key in context)) throw new Error(`Missing template variable '${key}' in value: ${template}`);
    return context[key] ?? match;
  });
}

export function expandPath(value: string, context: Record<string, string>): string {
  return expandHome(formatTemplate(value, context));
}

export function resolveInstallPath(spec: PlatformInstallSpec, context: Record<string, string>): string | null {
  if (spec.install_path_env && process.env[spec.install_path_env]) {
    return path.resolve(expandPath(process.env[spec.install_path_env]!, context));
  }
  if (spec.install_root_env || spec.install_root_default) {
    const rootValue = spec.install_root_env ? process.env[spec.install_root_env] || spec.install_root_default : spec.install_root_default;
    if (!rootValue) return null;
    const rootPath = path.resolve(expandPath(rootValue, context));
    return path.join(rootPath, formatTemplate(spec.install_path_suffix ?? "", context));
  }
  if (spec.install_path_default) {
    if (!context.repo_path && spec.install_path_default.includes("{repo_path}")) return null;
    return path.resolve(expandPath(spec.install_path_default, context));
  }
  return null;
}

export function authInstructions(platform: PlatformDefinition, context: Record<string, string>): string[] | null {
  if (platform.auth?.mode !== "interactive_handoff") return null;
  return (platform.auth.instructions ?? []).map((step) => formatTemplate(step, context));
}

// ── Install types ──

export type InstallResult = {
  platform: string;
  path: string;
  files: string[];
};

export type McpServerEntry = {
  type: string;
  url: string;
  headers?: Record<string, string>;
};

export type ManifestContext = {
  org_id: string;
  project_id: string;
  repo_ref: string;
  default_branch?: string;
  mcp_server_name?: string;
  mcp_server_url?: string;
};

// ── IDE-level install ──

const SKILL_BUNDLE_DIRS = ["references", "scripts"];
const SKILL_BUNDLE_FILES = ["SKILL.md"];

function copyDirRecursive(src: string, dest: string): string[] {
  const copied: string[] = [];
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copied.push(...copyDirRecursive(srcPath, destPath));
    } else {
      fs.copyFileSync(srcPath, destPath);
      copied.push(destPath);
    }
  }
  return copied;
}

export function installSkillToIde(
  platform: PlatformDefinition,
  context: Record<string, string>,
  skillDir = SKILL_DIR,
): InstallResult {
  if (!platform.skill?.supported) {
    throw new Error(`Platform '${platform.id}' does not support skill installation`);
  }

  const installPath = resolveInstallPath(platform.skill, {
    ...context,
    skill_name: SKILL_NAME,
  });
  if (!installPath) {
    throw new Error(`Cannot resolve skill install path for platform '${platform.id}'`);
  }

  fs.mkdirSync(installPath, { recursive: true });

  const copiedFiles: string[] = [];

  for (const file of SKILL_BUNDLE_FILES) {
    const src = path.join(skillDir, file);
    const dest = path.join(installPath, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      copiedFiles.push(dest);
    }
  }

  for (const dir of SKILL_BUNDLE_DIRS) {
    const src = path.join(skillDir, dir);
    if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
      copiedFiles.push(...copyDirRecursive(src, path.join(installPath, dir)));
    }
  }

  return { platform: platform.id, path: installPath, files: copiedFiles };
}

// ── Repo-level install ──

export function installMcpToRepo(
  platform: PlatformDefinition,
  context: Record<string, string>,
  serverName: string,
  serverUrl: string,
): InstallResult {
  if (!platform.mcp?.supported) {
    throw new Error(`Platform '${platform.id}' does not support MCP configuration`);
  }

  const configPath = resolveInstallPath(platform.mcp, context);
  if (!configPath) {
    throw new Error(`Cannot resolve MCP config path for platform '${platform.id}'`);
  }

  const configDir = path.dirname(configPath);
  fs.mkdirSync(configDir, { recursive: true });

  if (platform.mcp.format === "json_map") {
    const rootKey = platform.mcp.root_key ?? "mcpServers";
    let existing: Record<string, any> = {};
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    if (!existing[rootKey]) {
      existing[rootKey] = {};
    }
    existing[rootKey][serverName] = {
      type: "http",
      url: serverUrl,
    } satisfies McpServerEntry;
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + "\n");
  } else if (platform.mcp.format === "codex_toml") {
    let content = "";
    if (fs.existsSync(configPath)) {
      content = fs.readFileSync(configPath, "utf8");
    }
    if (!content.includes(`[mcp_servers.${serverName}]`)) {
      content +=
        `\n[mcp_servers.${serverName}]\n` +
        `type = "http"\n` +
        `url = "${serverUrl}"\n`;
      fs.writeFileSync(configPath, content);
    }
  } else {
    throw new Error(`Unsupported MCP format '${platform.mcp.format}' for platform '${platform.id}'`);
  }

  return { platform: platform.id, path: configPath, files: [configPath] };
}

export function installManifestToRepo(
  repoPath: string,
  manifest: ManifestContext,
): InstallResult {
  const manifestDir = path.join(repoPath, ".decisionops");
  const manifestPath = path.join(manifestDir, "manifest.toml");

  fs.mkdirSync(manifestDir, { recursive: true });

  const lines = [
    `version = 1`,
    `org_id = "${manifest.org_id}"`,
    `project_id = "${manifest.project_id}"`,
    `repo_ref = "${manifest.repo_ref}"`,
  ];
  if (manifest.default_branch) lines.push(`default_branch = "${manifest.default_branch}"`);
  if (manifest.mcp_server_name) lines.push(`mcp_server_name = "${manifest.mcp_server_name}"`);
  if (manifest.mcp_server_url) lines.push(`mcp_server_url = "${manifest.mcp_server_url}"`);

  fs.writeFileSync(manifestPath, lines.join("\n") + "\n");

  return { platform: "repo", path: manifestPath, files: [manifestPath] };
}
