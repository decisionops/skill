# Decision Ops MCP Interface

Use this reference only when you need the exact payload shape or error contract for the central MCP lifecycle.

## Authentication

All MCP tool calls require a valid OAuth access token (JWT). IDE MCP clients authenticate via interactive browser OAuth (authorization code + PKCE). There is no API key, token, or `client_credentials` method available for IDE users. Each IDE authenticates independently — CLI auth (`dops login`) does not carry over to IDE MCP sessions.

On first tool invocation, the IDE receives a `401` auth challenge with a `WWW-Authenticate` header pointing to the OAuth authorization server metadata. The user must complete sign-in and consent in the browser, then retry the tool call.

## Public APIs / Tools

`do-prepare-decision-gate`
- Purpose: combine project resolution and decision classification for one-step user prompting.
- Input:
  - `repo_ref` (path or URL; optional when `project_id` is provided)
  - `project_id` (optional when `repo_ref` is provided)
  - `branch` (optional)
  - `task_summary`
  - `changed_paths` (optional)
  - `client_hints` (optional) — pre-classification from the AI agent:
    - `recordable` (bool) — agent's assessment of recordability
    - `classification_reason` (string) — agent's rationale
    - `risk_level` (`low|medium|high`) — agent's risk estimate
    - `suggested_mode` (`quick|comprehensive`) — agent's mode recommendation
    - `signal_types` (optional array of `technical|product|business|governance`) — detected decision domains
  - When `client_hints` is provided, the backend uses it to override keyword heuristics. If the backend has its own LLM classification available, the backend LLM takes final priority. Merge order: `client_hints > heuristic` (no backend LLM) or `backend_llm > client_hints > heuristic` (with backend LLM).
- Output:
  - `org_id`, `project_id`, `repo`, `branch`
  - `recordable` (bool)
  - `classification_reason`
  - `risk_level` (`low|medium|high`)
  - `suggested_mode` (`quick|comprehensive`)

`do-search-decisions`
- Input:
  - `org_id`, `project_id`
  - `terms` (array)
  - `mode` (`quick|comprehensive|custom`)
  - `limit` (default `3` for quick, `5` for comprehensive)
  - `include_body` (default `false` for quick, `true` for comprehensive)
  - `custom` (object; optional, used when `mode=custom`)
- Output:
  - `items[]` with `id`, `title`, `status`, `date`, `score`, `snippet`, `superseded_by`, `related[]`, `body` (optional, present when `include_body=true`)
  - `candidate_supersedes[]`
  - `applied_parameters` (`mode`, `limit`, `include_body`, `custom`)

`do-create-decision-draft`
- Input:
  - `org_id`, `project_id`
  - `title`, `context`, `decision`
  - `type` (`technical|product|business|governance`, default `technical`)
  - `scope_level` (`org|project|repo`, default `project`)
  - `repo_id` (optional; used for `scope_level=repo`, especially in multi-repo projects)
  - `options`, `consequences`, `related` (arrays)
  - `supersedes` (array)
  - `single_option_justification` (string; required when only one option is supplied)
  - `validation_plan` (`metric`, `baseline`, `target`, `by_date`)
- Output:
  - `decision_id`, `version`, `status` (`Proposed`)
- Notes:
  - Project-scoped drafts can be created even when the project has no linked repositories.
  - Only `scope_level=repo` requires linked repository resolution. Multi-repo projects must provide `repo_id` explicitly for repo-scoped drafts.

`do-validate-decision`
- Input:
  - `org_id`, `project_id`
  - `decision_id` (string; optional when `draft` is provided)
  - `draft` (object; optional when `decision_id` is provided)
- Output:
  - `valid` (bool)
  - `errors[]` (`code`, `field`, `message`)
  - `warnings[]` (`code`, `field`, `message`)
- Notes:
  - When validating an inline `draft`, scope resolution is checked too.
  - Repo-scoped drafts can fail validation for missing or ambiguous repository linkage before creation.

`do-publish-decision`
- Input:
  - `org_id`, `project_id`, `decision_id`, `expected_version`
- Output:
  - `decision_id`, `status` (`Accepted`)
  - `supersede_updates[]` (`old_id`, `superseded_by`)
  - `published_at`
  - `version`

`do-get-decision`
- Read-only API.
- Input: `org_id`, `project_id`, `decision_id`
- Output: full `DecisionRecord`

## Public Types

`DecisionRecord`
- `id`, `decision_id`, `org_id`, `project_id`, `repo`, `branch`
- `title`, `status` (`Proposed|Accepted|Superseded`), `type` (`technical|product|business|governance`)
- `internal_status` (canonical DB status)
- `context`, `decision`
- `options[]`, `consequences[]`, `related[]`
- `supersedes[]`
- `validation_plan` (`metric`, `baseline`, `target`, `by_date`)
- `created_at`, `updated_at`, `version`

## Error Contract

Error responses have the shape `{ error: { code, message, field, details } }`.

Possible error codes:
- `PROJECT_NOT_FOUND` (404)
- `NOT_FOUND` (404)
- `VALIDATION_FAILED` (422)
- `VERSION_CONFLICT` (409)

Note: `AUTH_REQUIRED` errors are handled at the middleware layer before reaching the decision-ops service.

## Evaluation Scenarios

Use these scenarios when reviewing output quality:

1. Non-recordable task returns `recordable=false`; selecting `Skip` performs no writes.
2. Recordable task with `Quick` fetches at most 3 summaries and publishes successfully.
3. Recordable task with `Comprehensive` fetches full entries, identifies supersede candidates, and publishes with atomic supersede updates.
4. `Other` requires custom instructions; those instructions alter search and evaluation parameters for that run only.
5. Wrong project context is caught at gate display before draft creation.
6. Validation failure blocks publish until corrected.
7. Version conflict on publish requires retry with the latest version.
8. `do-get-decision` remains read-only and never creates records.
