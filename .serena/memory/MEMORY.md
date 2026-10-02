<!--
MEMORY.md is an INDEX, not a content store. It loads into context every session,
so keep it lean — aim for < 200 lines.
  • One line per memory: `- [Title](path) — short hook` (≤ 200 chars).
  • The detail lives in the linked topic file, NOT here. Never paste a summary in.
  • Group entries under a few category headers — do NOT add a `##` section per memory.
  • Do NOT index spec/, report/, research/, or project/ memories — those are browsed
    with list_memories(topic="…"), never listed here.
The write_memory hook warns when these are violated; trim on the warning.
-->

## Response & Style

- [Response Format](feedback/FEEDBACK_RESPONSE_FORMAT.md) — no conversational language, use functional/direct phrasing only
- [Read docs = list memories](feedback/FEEDBACK_READ_DOCS_MEANS_LIST.md) — "read the docs" means check MEMORY.md and use Serena to list_memories, not external docs
- [Commit prefixes](feedback/FEEDBACK_COMMIT_PREFIXES.md) — `<type>: <change>` (no version suffix; patch auto-bumped by pre-commit hook); never "Bump version to …" subjects

## Features

- [Feature Index](index/INDEX_FEATURES.md) — Feature registry with relationships and types
- [Pantheon Dashboard](feature/FEATURE_DASHBOARD.md) — activation, message protocol, PantheonApi, shell runner, key files
- [Workflow polling](dom/DOM_DASHBOARD_WORKFLOW_POLLING.md) — waitForEnv contract, downstream refresh after workflows settle
- [Connection mode](dom/DOM_DASHBOARD_CONNECTION_MODE.md) — SFTP/Git toggle flow
- [Commits](dom/DOM_DASHBOARD_COMMITS.md) — SFTP diffstat/commit, unpushed, push, pending commits
- [Deploys](dom/DOM_DASHBOARD_DEPLOYS.md) — deploy to test/live
- [Clear caches](dom/DOM_DASHBOARD_CLEAR_CACHE.md) — per-env cache clear
- [Content sync](dom/DOM_DASHBOARD_CONTENT_SYNC.md) — database/files clone between environments

## Reference

- [Memory Maintenance](ref/REF_MEMORY_MAINTENANCE.md) — how memories are created & maintained (discovery model, style, add/update threshold, maintenance actions)

## Architecture

- [Architecture Overview](arch/ARCH_SWE.md) — Workflow system architecture

## Workflow Routing

| Situation                | Go To                     |
| ------------------------ | ------------------------- |
| Simple lookup ("find X") | `WF_RESEARCH`             |
| Starting work (full)     | `WF_INIT` → `WF_CLASSIFY` |
| Researching              | `WF_RESEARCH`             |
| Making changes           | `WF_CLASSIFY`             |
| Continuing               | `WF_CONTINUE`             |
| Verifying                | `WF_VERIFY`               |

## Memory Types

| Prefix   | Purpose           |
| -------- | ----------------- |
| FEATURE_ | Feature configs   |
| DOM_     | Domain behaviors  |
| SYS_     | System references |
| REF_     | Reference docs    |
| INDEX_   | Navigation        |
| ARCH_    | Architecture      |
| SPEC_    | Specifications    |
| WF_      | Workflow states   |
| WM_      | Session state     |
