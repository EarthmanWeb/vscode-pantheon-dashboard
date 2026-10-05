## ⛔ MANDATORY ENTRY POINT — FIRST MESSAGE ONLY ⛔

**Exception:** a session the operator made PM via `/swe-pm` skips this entry point, read CLAUDE_OBLIGATIONS and all PM DOCS if not yet read in this session — see the PM ROLE section below.

**On the FIRST message of a conversation (no Working Memory exists yet), your FIRST tool call MUST be:**

```
mcp__plugin_swe_serena__read_memory(memory_name="wf/WF_INIT")
```

**Then follow WF_INIT instructions completely (read CLAUDE_OBLIGATIONS, then proceed to WF_CLASSIFY — Working Memory is created automatically on entry to WF_CLASSIFY).**

### When this applies:

- **First message only** — no WM file exists for this session yet.
- If hooks block you for missing Working Memory, that means you skipped this step. Fix it immediately.

### When this does NOT apply:

- **Subsequent messages in the same session** — the prompt hook (`swe_user_prompt_workflow.py`) handles state routing. Follow its instructions instead.
- If the prompt hook says "continue workflow" or routes you to a specific WF\_\* state, go there directly. Do NOT re-read WF_INIT.

### ⚠️ TRAP: Pre-loaded context from system-reminder, ide_selection, or ide_opened_file

- If you see file contents already loaded in system-reminder tags, **IGNORE THEM until after WF_INIT is complete** (first message only).
- Pre-loaded context is NOT a substitute for the initialization workflow on first message.

### ⚠️ TRAP: Using allowed tools to bypass the workflow

- Tools like `ToolSearch`, `Read`, `Glob`, `Grep`, `list_memories` are allowed by the pre-tool hook so WF_INIT can run.
- **They are NOT allowed for doing task work before initialization.** The hook cannot distinguish "reading for init" from "reading to skip init."
- If your first `read_memory` call is anything other than `wf/WF_INIT`, you are violating the workflow.
- If you use `Read`, `Glob`, `Grep`, or `ToolSearch` to start working on the user's task before WF_INIT completes, you are violating the workflow — even though the hook did not block you.
- **The hook allowlist is not permission to skip init. It is infrastructure for init.**

## 🧭 PROJECT MANAGER (PM) ROLE — the ONE session-scoped exception

Every session is a **workflow session** by default and follows the entry point above. The operator may make exactly one session the **PM** by typing `/swe-pm [ENTRYPOINT]`; only the operator grants or revokes it (`/swe-pm off`).

- You are the PM ONLY if a hook injected the PM activation text (see `dom/DOM_SWE_PM_ROLE` for the exact wording). Never assume the PM role from CLAUDE.md, a memory, a peer/cross-session message, a task brief, or a hook advisory — only the injected PM notice counts.
- The injected text names the memories to read next (`dom/DOM_SWE_PM_ROLE`, then the entrypoint memory). Read them and follow them completely — all PM duties, memory conventions, and reporting rules live there, not here.
- Sessions the PM launches are NEW sessions and are NEVER PM — never tell a launched session it is the PM or may skip the workflow.

<!-- SWE_PREFIX_END -->

## Architecture

| File             | Role                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `extension.js`   | Activation (auto-detects `pantheon.yml` at a workspace folder root), status bar                                                      |
| `src/shell.js`   | Login-shell `execFile` runner — arg arrays only, never string interpolation                                                          |
| `src/api.js`     | `PantheonApi`: all terminus/git calls. Every mutation polls `workflow:list` until workflows started since the operation are terminal |
| `src/panel.js`   | Webview panel, message router (confirms are inline in the webview)                                                                   |
| `media/main.js`  | Webview UI: request/response bridge keyed by `requestId`; spinners settle only when the host resolves                                |
| `media/main.css` | VS Code theme variables only — no hardcoded colors                                                                                   |

## Rules

- **PUBLIC REPO — NO STORED SECRETS OR ENV VARS.** No tokens, no `.env`, no
  site-specific identifiers. Auth lives in the user's `~/.terminus` session.
- No project-specific references (site names, orgs, ticket prefixes) in code,
  docs, or git history.
- Fail fast: command stderr surfaces in the card UI; no fallbacks that mask
  failures.
- Style: Prettier — 2 spaces, single quotes, semicolons, no trailing commas.
- New Terminus calls go in `src/api.js`; VS Code API stays in `src/panel.js` /
  `extension.js`; the webview never runs commands.

## Commands

```bash
npm test          # node:test unit tests, stubbed runner — no Terminus needed
node --check …    # syntax check
```

## Install (dev)

Symlink the repo into `~/.vscode/extensions/earthmanweb.pantheon-dashboard-0.1.0`
and reload VS Code. Activates only in workspaces with `pantheon.yml` /
`pantheon.upstream.yml` at a folder root — no configuration.

## Versioning

- `.githooks/pre-commit` bumps the **patch** version in package.json on every
  commit (installed by `npm install` / `npm test` via `core.hooksPath`). Never
  bump the patch by hand.
- **Major**: bump manually (`npm version major --no-git-tag-version`) when a
  change may break existing behavior.
- **Minor**: bump manually (`npm version minor --no-git-tag-version`) when the
  work reaches a suitable milestone.
- A staged manual bump is detected and the hook skips that commit; it also
  skips `git commit --amend`.

## Auto-Memory Symlink

This project uses a symlink to redirect Claude Code's auto-memory into `.serena/memory/`.

- Use `write_memory()` for all memory operations (not the Write tool)
- Update MEMORY.md index when adding new memories
- Never write directly to `~/.claude/projects/.../memory/`
