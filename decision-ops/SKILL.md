---
name: decision-ops
description: "Captures and retrieves project rationale when a prompt implies a meaningful product, technical, or business tradeoff. Triggers on prompts like 'should we...', 'which option...', 'choose between...', 'prioritize...', 'what should we cut', 'descope', 'migrate to...', 'how should we release this', 'staged rollout', 'change pricing/onboarding/KPIs', 'improve reliability/performance/security', 'change vendors', 'select a partner', 'allocate budget', 'change revenue model', 'enter new market', 'change go-to-market', or 'compliance requirement'. Skips typo fixes, doc spelling, pure reformatting, and version bumps with no architectural choice."
license: Apache-2.0
compatibility: "Requires repository-local files and network access to the Decision Ops MCP service at https://api.aidecisionops.com/mcp. MCP authentication requires interactive browser OAuth (authorization code + PKCE) — there is no API key or token-based alternative for IDE users. The MCP server must be manually enabled in the IDE settings before first use."
metadata:
  maturity: "stable"
---

# Decision Ops

This skill teaches AI coding agents when and how to log decisions. The canonical decision store is the DecisionOps MCP service — not a local markdown file.

## Local Manifest Binding

For IDE-driven usage, prefer a repository-local manifest at `.decisionops/manifest.toml`.

- Read it first when present by running `scripts/read-manifest.sh <repo-path>` from the installed skill directory.
- Required fields:
  - `org_id`
  - `project_id`
  - `repo_ref`
- Recommended fields:
  - `default_branch`
  - `mcp_server_name`
  - `mcp_server_url`
  - `repo_id` (optional local hint only; do not require it)
- Treat the manifest as local binding/config only. The MCP service remains the canonical system of record.
- If the manifest and central gate resolve to different org/project/repo values, stop and ask the user which context is correct before writing anything.

## Workflow

Use this workflow only when the task includes an explicit, non-trivial product, technical, or business tradeoff worth recording.

1. Run the one-step gate with client hints.
- If `.decisionops/manifest.toml` exists, read it first and use `repo_ref` plus `default_branch` as the preferred local binding context.
- **Before calling the gate**, pre-classify the task yourself and include `client_hints` in the gate call. You have better semantic understanding of the user's intent than keyword matching. Compute:
  - `recordable`: Does this task involve a meaningful tradeoff worth recording? (choosing between alternatives, introducing/removing dependencies, changing architecture, etc.)
  - `classification_reason`: A concrete, one-sentence explanation of why this is or isn't recordable.
  - `risk_level`: `"low"` | `"medium"` | `"high"` — based on blast radius, reversibility, and stakeholder impact.
  - `suggested_mode`: `"quick"` for low/medium risk single-domain decisions, `"comprehensive"` for high-risk or cross-domain ones.
  - `signal_types`: Which domains this touches — `["technical"]`, `["product", "business"]`, etc.
- Call `decision-ops:do-prepare-decision-gate` with `client_hints` included (where `decision-ops` is the MCP server name from the manifest's `mcp_server_name`, defaulting to `decision-ops`). The backend uses your hints when its own keyword heuristic would otherwise miss the signal. Example:
  ```json
  {
    "repo_ref": "owner/repo",
    "task_summary": "Which ORM should we use — Drizzle vs Prisma vs Kysely",
    "client_hints": {
      "recordable": true,
      "classification_reason": "Choosing a project ORM is a durable technical dependency decision.",
      "risk_level": "medium",
      "suggested_mode": "quick",
      "signal_types": ["technical"]
    }
  }
  ```
- If central repository resolution fails but the manifest contains `org_id` and `project_id`, continue in manifest-bound mode and say so explicitly.
- **Always** show one user prompt with resolved `org/project/repo/branch`, the classification reason, and the choices `Quick`, `Comprehensive`, `Skip`, or `Other`.
- If the gate returns `recordable: false`, still present the choices to the user. The gate is a heuristic hint, not a final decision. If the user's prompt clearly involves choosing between alternatives (e.g., "Which ORM should I use?", "Drizzle vs Prisma"), treat that as a decision worth recording regardless of the gate classification. Tell the user the gate classified it as not recordable, but offer to proceed anyway.

2. Gather evidence for the selected mode.
- `Skip`: stop decision flow and continue implementation without a decision write.
- `Quick`: fetch up to 3 relevant prior decisions.
- `Comprehensive`: fetch up to 5 relevant prior decisions, including supersede candidates and prior outcomes.
- `Other`: require brief custom instructions, then map them to explicit search and evaluation parameters.

3. Evaluate options before acting.
- Record at least 2 viable options, or include an explicit single-option justification.
- Compare user impact, execution risk, reversibility, and hard constraints.
- Choose and implement the preferred option.

4. Validate the draft before publish.
- Default to `scope_level: project` for project-wide decisions. Use `scope_level: repo` only when the decision should be bound to one repository.
- Create the draft with `decision-ops:do-create-decision-draft`.
- Run `decision-ops:do-validate-decision`.
- Fix validation failures before publishing.

5. Publish and trace the outcome.
- Publish with `decision-ops:do-publish-decision`.
- Apply supersede updates atomically where declared.
- Return `decision_id` and reference it in PR or commit metadata.

## Decision Triggers

Record a decision when at least one of these is true:
- Introduce, remove, or significantly upgrade a dependency, platform, or provider.
- Change API shape, integration contract, schema, storage model, or data retention behavior.
- Choose between non-trivial product directions (pricing, onboarding flow, rollout strategy, support model).
- Adopt, defer, or waive a security/compliance/reliability control.
- Set a non-obvious testing or release strategy with explicit risk tradeoffs.
- Select, change, or terminate a vendor, supplier, or strategic partner.
- Make a significant budget, headcount, or resource allocation decision.
- Commit to a legal, contractual, or regulatory obligation, or change go-to-market strategy, customer segmentation, or revenue model.

## Assumptions and Defaults

- Central service is the only canonical source.
- Local manifest is an optional binding layer for IDE/repository setup.
- One-step gate is shown for every recordable decision attempt.
- User chooses mode each time (`Quick|Comprehensive|Skip|Other`).
- `Other` requires custom instructions and then continues.
- Decision flow is fail-closed when validation fails. Project resolution may fall back to the local manifest when present.
- PR/commit traceability must include `decision_id`.

## References

- Use the manifest contract in [references/decision-ops-manifest.md](references/decision-ops-manifest.md).
- Use the MCP lifecycle contract in [references/mcp-interface.md](references/mcp-interface.md).
- Use the markdown structure in [references/decision-register-format.md](references/decision-register-format.md).
- Use the evaluation assets in [evals/trigger-queries.json](evals/trigger-queries.json) and [evals/evals.json](evals/evals.json) when validating activation and outcome quality.
