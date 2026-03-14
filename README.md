# Decision Ops Skill

AI agent skill bundle that teaches coding agents when and how to record architectural, product, and business decisions. Integrates with the DecisionOps MCP service as the canonical decision store.

## What it does

When an AI coding agent encounters a task involving a non-trivial tradeoff, this skill guides it through a structured workflow:

1. **Gate** — Classify whether the task warrants a recorded decision
2. **Gather** — Fetch relevant prior decisions (2-5 depending on mode)
3. **Evaluate** — Compare options on impact, risk, reversibility, and constraints
4. **Validate** — Check the draft against organization constraints
5. **Publish** — Record the decision and reference `decision_id` in PR/commit metadata

The agent prompts the user to choose a mode (Quick, Comprehensive, Skip, or Other) before proceeding.

## Install

### Via dops CLI (recommended)

```bash
dops install --platform claude-code
```

See the `dops` CLI documentation for setup instructions.

### Manual install

Copy the `decision-ops/` directory to your platform's skill directory:

```bash
# Claude Code
cp -r decision-ops/ ~/.claude/skills/decision-ops/

# Cursor
cp -r decision-ops/ ~/.cursor/skills/decision-ops/
```

Then configure the MCP server in your platform's config. For Claude Code, add to `.mcp.json`:

```json
{
  "mcpServers": {
    "decision-ops": {
      "url": "https://api.aidecisionops.com/mcp"
    }
  }
}
```

And bind the repository by creating `.decisionops/manifest.toml`:

```toml
[decisionops]
org_id = "your-org"
project_id = "your-project"
repo_ref = "owner/repo"
default_branch = "main"

[mcp]
server_name = "decision-ops"
server_url = "https://api.aidecisionops.com/mcp"
```

## Supported platforms

| Platform | Skill install | MCP config |
|---|---|---|
| Claude Code | `~/.claude/skills/decision-ops/` | `.mcp.json` |
| VS Code | not supported | `.vscode/mcp.json` |
| Cursor | `~/.cursor/skills/decision-ops/` | `.cursor/mcp.json` |
| Codex | `~/.codex/skills/decision-ops/` | `codex.toml` |
| Antigravity | `~/.antigravity/skills/decision-ops/` | `.antigravity/mcp.json` |

Platform definitions are in `platforms/*.toml`.

## Decision triggers

The skill activates when a task involves at least one of:

- Introducing, removing, or upgrading a dependency, platform, or provider
- Changing API shape, schema, storage model, or data retention
- Choosing between product directions (pricing, onboarding, rollout strategy)
- Adopting, deferring, or waiving a security/compliance/reliability control
- Setting a testing or release strategy with explicit risk tradeoffs
- Selecting, changing, or terminating a vendor or partner
- Making budget, headcount, or resource allocation decisions
- Committing to legal/contractual/regulatory obligations

The skill skips typo fixes, doc spelling, pure reformatting, and version bumps with no architectural choice.

## MCP tools

The skill uses 6 MCP tools provided by the DecisionOps service:

| Tool | Purpose |
|---|---|
| `do-prepare-decision-gate` | Resolve project context and classify whether a task is recordable |
| `do-search-decisions` | Search prior decisions by terms, with mode-based limits |
| `do-create-decision-draft` | Create a decision draft with options, consequences, and validation plan |
| `do-validate-decision` | Validate a draft or existing decision against org constraints |
| `do-publish-decision` | Publish a proposed decision (transition to Accepted) |
| `do-get-decision` | Read-only fetch of a full decision record |

Full payload shapes and error contracts are in `decision-ops/references/mcp-interface.md`.

## Skill structure

```
decision-ops/              # The installable skill bundle
  SKILL.md                 # Skill definition with activation criteria and workflow
  references/
    decision-ops-manifest.md   # .decisionops/manifest.toml contract
    mcp-interface.md           # MCP tool payloads and error codes
    decision-register-format.md # Decision record markdown format
  evals/
    trigger-queries.json   # Activation precision/recall test cases
    evals.json             # End-to-end workflow fidelity tests
  agents/
    openai.yaml            # OpenAI agent platform config
  scripts/
    read-manifest.sh       # Shell helper to read manifest TOML
platforms/                 # Platform target definitions (TOML)
  claude-code.toml
  vscode.toml
  cursor.toml
  codex.toml
  antigravity.toml
scripts/
  validate.ts              # Bundle validation script
src/
  index.ts                 # Package exports (metadata, platform loader)
```

## Evals

### Trigger queries (`evals/trigger-queries.json`)

Tests activation precision and recall. Contains positive cases (should trigger the skill) and negative cases (should not trigger). Each entry has `id`, `prompt`, and `why`.

### Workflow evals (`evals/evals.json`)

End-to-end cases testing the full decision workflow. Each case defines `expected_behavior` and a `rubric` for grading agent output quality.

Run the eval suite with your preferred eval harness, feeding the cases as test inputs.

## Validation

Validate the skill bundle structure:

```bash
bun run scripts/validate.ts
```

Checks: SKILL.md frontmatter (name, description), body length, trigger-queries format, evals format, agent configs, and script executability.

## Development

```bash
bun install
bun run validate          # validate bundle structure
bun run typecheck         # type check
bun test                  # run tests
```

### Modifying the skill

- Edit `decision-ops/SKILL.md` for workflow changes
- Edit `decision-ops/references/*.md` for MCP or format contract changes
- Add platform support by creating a new TOML in `platforms/`
- Run `bun run validate` after changes to verify bundle integrity

## License

Apache-2.0
