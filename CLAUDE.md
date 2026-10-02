# CLAUDE.md — vscode-pantheon-dashboard

VS Code extension: webview dashboard for Pantheon Terminus (mode toggle,
commits, deploys). Plain JavaScript, no build step.

## Architecture

| File | Role |
| ---- | ---- |
| `extension.js` | Activation (auto-detects `pantheon.yml` at a workspace folder root), status bar |
| `src/shell.js` | Login-shell `execFile` runner — arg arrays only, never string interpolation |
| `src/api.js` | `PantheonApi`: all terminus/git calls. Every mutation polls `workflow:list` until workflows started since the operation are terminal |
| `src/panel.js` | Webview panel, message router, native confirm dialogs |
| `media/main.js` | Webview UI: request/response bridge keyed by `requestId`; spinners settle only when the host resolves |
| `media/main.css` | VS Code theme variables only — no hardcoded colors |

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

Bump `version` in package.json in the same commit as every pushed change.
