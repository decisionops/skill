import { describe, test, expect, beforeAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  SKILL_NAME,
  SKILL_DIR,
  PLATFORMS_DIR,
  loadPlatforms,
  selectPlatforms,
  expandHome,
  expandPath,
  formatTemplate,
  resolveInstallPath,
  authInstructions,
  type PlatformDefinition,
  type PlatformInstallSpec,
} from "./index";

// ── Constants ──

describe("constants", () => {
  test("SKILL_NAME is decision-ops", () => {
    expect(SKILL_NAME).toBe("decision-ops");
  });

  test("SKILL_DIR points to decision-ops directory", () => {
    expect(SKILL_DIR).toContain("decision-ops");
    expect(fs.existsSync(SKILL_DIR)).toBe(true);
  });

  test("PLATFORMS_DIR points to platforms directory", () => {
    expect(PLATFORMS_DIR).toContain("platforms");
    expect(fs.existsSync(PLATFORMS_DIR)).toBe(true);
  });
});

// ── expandHome ──

describe("expandHome", () => {
  test("expands ~ to HOME", () => {
    const home = process.env.HOME!;
    expect(expandHome("~/foo")).toBe(path.join(home, "foo"));
  });

  test("expands bare ~", () => {
    const home = process.env.HOME!;
    expect(expandHome("~")).toBe(home);
  });

  test("leaves absolute paths unchanged", () => {
    expect(expandHome("/usr/local/bin")).toBe("/usr/local/bin");
  });

  test("leaves relative paths unchanged", () => {
    expect(expandHome("relative/path")).toBe("relative/path");
  });

  test("does not expand ~user style paths", () => {
    expect(expandHome("~other/foo")).toBe("~other/foo");
  });
});

// ── formatTemplate ──

describe("formatTemplate", () => {
  test("replaces single variable", () => {
    expect(formatTemplate("hello {name}", { name: "world" })).toBe("hello world");
  });

  test("replaces multiple variables", () => {
    expect(formatTemplate("{a}/{b}", { a: "x", b: "y" })).toBe("x/y");
  });

  test("throws on missing variable", () => {
    expect(() => formatTemplate("{missing}", {})).toThrow("Missing template variable");
  });

  test("returns string unchanged when no placeholders", () => {
    expect(formatTemplate("no-vars", {})).toBe("no-vars");
  });
});

// ── expandPath ──

describe("expandPath", () => {
  test("expands both ~ and template vars", () => {
    const home = process.env.HOME!;
    const result = expandPath("~/{dir}/sub", { dir: "test" });
    expect(result).toBe(path.join(home, "test/sub"));
  });
});

// ── loadPlatforms ──

describe("loadPlatforms", () => {
  let platforms: Record<string, PlatformDefinition>;

  beforeAll(() => {
    platforms = loadPlatforms();
  });

  test("loads at least one platform", () => {
    expect(Object.keys(platforms).length).toBeGreaterThan(0);
  });

  test("loads claude-code platform", () => {
    expect(platforms["claude-code"]).toBeDefined();
    expect(platforms["claude-code"].id).toBe("claude-code");
    expect(platforms["claude-code"].display_name).toBeDefined();
  });

  test("loads cursor platform", () => {
    expect(platforms["cursor"]).toBeDefined();
  });

  test("loads codex platform", () => {
    expect(platforms["codex"]).toBeDefined();
  });

  test("each platform has __file__ metadata", () => {
    for (const p of Object.values(platforms)) {
      expect(p.__file__).toContain(".toml");
    }
  });

  test("throws on non-existent directory", () => {
    expect(() => loadPlatforms("/nonexistent")).toThrow();
  });
});

// ── selectPlatforms ──

describe("selectPlatforms", () => {
  let platforms: Record<string, PlatformDefinition>;

  beforeAll(() => {
    platforms = loadPlatforms();
  });

  test("returns all platforms when no filter", () => {
    const selected = selectPlatforms(platforms);
    expect(selected.length).toBe(Object.keys(platforms).length);
  });

  test("filters by specific IDs", () => {
    const selected = selectPlatforms(platforms, ["claude-code", "cursor"]);
    expect(selected.length).toBe(2);
    expect(selected.map((p) => p.id)).toEqual(["claude-code", "cursor"]);
  });

  test("filters by skill capability", () => {
    const selected = selectPlatforms(platforms, undefined, "skill");
    for (const p of selected) {
      expect(p.skill?.supported).toBe(true);
    }
  });

  test("filters by mcp capability", () => {
    const selected = selectPlatforms(platforms, undefined, "mcp");
    for (const p of selected) {
      expect(p.mcp?.supported).toBe(true);
    }
  });

  test("throws on unknown platform ID", () => {
    expect(() => selectPlatforms(platforms, ["nonexistent"])).toThrow("Unknown platform");
  });
});

// ── resolveInstallPath ──

describe("resolveInstallPath", () => {
  test("uses install_path_default with expansion", () => {
    const spec: PlatformInstallSpec = {
      supported: true,
      install_path_default: "~/.claude/skills/decision-ops",
    };
    const result = resolveInstallPath(spec, {});
    expect(result).toContain("skills/decision-ops");
  });

  test("returns null when repo_path needed but missing", () => {
    const spec: PlatformInstallSpec = {
      supported: true,
      install_path_default: "{repo_path}/.config",
    };
    const result = resolveInstallPath(spec, {});
    expect(result).toBeNull();
  });

  test("uses install_root_default with suffix", () => {
    const spec: PlatformInstallSpec = {
      supported: true,
      install_root_default: "~/.codex",
      install_path_suffix: "skills/{skill_name}",
    };
    const result = resolveInstallPath(spec, { skill_name: "decision-ops" });
    expect(result).toContain("skills/decision-ops");
  });

  test("returns null for empty spec", () => {
    const result = resolveInstallPath({}, {});
    expect(result).toBeNull();
  });
});

// ── authInstructions ──

describe("authInstructions", () => {
  test("returns null for non-interactive_handoff mode", () => {
    const platform: PlatformDefinition = {
      id: "test",
      display_name: "Test",
      auth: { mode: "api_key" },
      __file__: "test.toml",
    };
    expect(authInstructions(platform, {})).toBeNull();
  });

  test("returns instructions for interactive_handoff", () => {
    const platform: PlatformDefinition = {
      id: "test",
      display_name: "Test",
      auth: {
        mode: "interactive_handoff",
        instructions: ["Step 1: {action}", "Step 2: done"],
      },
      __file__: "test.toml",
    };
    const result = authInstructions(platform, { action: "verify" });
    expect(result).toEqual(["Step 1: verify", "Step 2: done"]);
  });

  test("returns null when no auth", () => {
    const platform: PlatformDefinition = {
      id: "test",
      display_name: "Test",
      __file__: "test.toml",
    };
    expect(authInstructions(platform, {})).toBeNull();
  });
});

// ── Skill bundle structure ──

describe("skill bundle structure", () => {
  test("SKILL.md exists and has frontmatter", () => {
    const content = fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");
    expect(content.startsWith("---")).toBe(true);
    expect(content).toContain("name: decision-ops");
  });

  test("trigger-queries.json has 10+ positive and 10+ negative", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(SKILL_DIR, "evals", "trigger-queries.json"), "utf8"),
    );
    expect(data.positive.length).toBeGreaterThanOrEqual(10);
    expect(data.negative.length).toBeGreaterThanOrEqual(10);
  });

  test("evals.json has version 1 and 2+ cases", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(SKILL_DIR, "evals", "evals.json"), "utf8"),
    );
    expect(data.version).toBe(1);
    expect(data.cases.length).toBeGreaterThanOrEqual(2);
  });

  test("each eval case has expected_behavior and rubric", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(SKILL_DIR, "evals", "evals.json"), "utf8"),
    );
    for (const c of data.cases) {
      expect(c.id).toBeDefined();
      expect(c.expected_behavior.length).toBeGreaterThan(0);
      expect(c.rubric.length).toBeGreaterThan(0);
    }
  });

  test("each trigger query entry has id, prompt, why", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(SKILL_DIR, "evals", "trigger-queries.json"), "utf8"),
    );
    for (const entry of [...data.positive, ...data.negative]) {
      expect(entry.id).toBeDefined();
      expect(entry.prompt).toBeDefined();
      expect(entry.why).toBeDefined();
    }
  });

  test("openai.yaml references $decision-ops", () => {
    const content = fs.readFileSync(path.join(SKILL_DIR, "agents", "openai.yaml"), "utf8");
    expect(content).toContain("$decision-ops");
  });

  test("read-manifest.sh is executable-compatible", () => {
    const content = fs.readFileSync(
      path.join(SKILL_DIR, "scripts", "read-manifest.sh"),
      "utf8",
    );
    expect(content.startsWith("#!/usr/bin/env bash")).toBe(true);
  });
});
