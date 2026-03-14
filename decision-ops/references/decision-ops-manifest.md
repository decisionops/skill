# Decision Ops Manifest

Use `.decisionops/manifest.toml` in the target repository root to bind a local repository to central Decision Ops identifiers.

## Required fields

- `org_id`
- `project_id`
- `repo_ref`

## Recommended fields

- `default_branch`
- `mcp_server_name`
- `mcp_server_url`
- `repo_id` (optional local hint; current MCP workflow should not require it)

## Example

```toml
version = 1
org_id = "org_123"
project_id = "proj_456"
repo_ref = "decisionops/skill"
default_branch = "main"
mcp_server_name = "decision-ops-mcp"
mcp_server_url = "https://api.aidecisionops.com/mcp"
```

## Behavior

- The manifest is local configuration, not the canonical decision register.
- Agents should read the manifest before calling the central MCP lifecycle.
- If central gate resolution succeeds, agents should compare the resolved context against the manifest.
- If central gate resolution fails because the repo is unknown, agents may continue with manifest `org_id` and `project_id` for MCP read/write calls and should say that they are in manifest-bound mode.
