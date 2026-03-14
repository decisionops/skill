# Decision Ops MCP Interface

Use this reference only when you need the exact payload shape or error contract for the central MCP lifecycle.

## Public APIs / Tools

`do-prepare-decision-gate`
- Purpose: combine project resolution and decision classification for one-step user prompting.
- Input:
  - `repo_ref` (path or URL)
  - `branch`
  - `task_summary`
  - `changed_paths` (optional)
- Output:
  - `org_id`, `project_id`, `repo`, `branch`
  - `recordable` (bool)
  - `classification_reason`
  - `tags[]`
  - `risk_level` (`low|medium|high`)
  - `suggested_mode` (`quick|comprehensive`)
  - `canonical_store` = `central`

`do-search-decisions`
- Input:
  - `org_id`, `project_id`
  - `terms` (array)
  - `mode` (`quick|comprehensive|custom`)
  - `limit` (default `3` for quick, `5` for comprehensive)
  - `include_body` (default `false` for quick, `true` for comprehensive)
  - `custom` (object; optional, used when `mode=custom`)
- Output:
  - `items[]` with `id`, `title`, `status`, `date`, `score`, `snippet`, `superseded_by`, `related[]`
  - `candidate_supersedes[]`

`do-create-decision-draft`
- Input:
  - `org_id`, `project_id`
  - `title`, `context`, `decision`
  - `options`, `consequences`, `related` (arrays)
  - `supersedes` (array)
  - `single_option_justification` (string; required when only one option is supplied)
  - `validation_plan` (`metric`, `baseline`, `target`, `by_date`)
- Output:
  - `decision_id`, `version`, `status` (`Proposed`)

`do-validate-decision`
- Input:
  - `org_id`, `project_id`
  - `decision_id` (string; optional when `draft` is provided)
  - `draft` (object; optional when `decision_id` is provided)
- Output:
  - `valid` (bool)
  - `errors[]` (`code`, `field`, `message`)
  - `warnings[]`

`do-publish-decision`
- Input:
  - `org_id`, `project_id`, `decision_id`, `expected_version`
- Output:
  - `decision_id`, `status` (`Accepted`)
  - `supersede_updates[]` (`old_id -> Superseded by <new_id>`)
  - `published_at`

`do-get-decision`
- Read-only API.
- Input: `org_id`, `project_id`, `decision_id`
- Output: full `DecisionRecord`

## Public Types

`DecisionRecord`
- `id`, `org_id`, `project_id`, `repo`, `branch`
- `title`, `status` (`Proposed|Accepted|Superseded|Rejected`)
- `context`, `decision`
- `options[]`, `consequences[]`, `related[]`
- `supersedes[]`
- `validation_plan` (`metric`, `baseline`, `target`, `by_date`)
- `created_by`, `created_at`, `updated_at`, `version`

## Error Contract

- `AUTH_REQUIRED`
- `PROJECT_NOT_FOUND`
- `VALIDATION_FAILED`
- `VERSION_CONFLICT`
- `NOT_FOUND`
- `RATE_LIMITED`

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
