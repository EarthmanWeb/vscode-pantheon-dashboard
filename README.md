# Pantheon Dashboard (VS Code extension)

Mini dashboard surfacing Pantheon Terminus operations for the workspace's site:

- **Login gate** — uses your shell's `terminus` session. Not logged in? The panel
  shows login instructions and a link to the
  [Terminus docs](https://docs.pantheon.io/terminus/install).
- **Site switcher** — auto-matches the workspace folder name against
  `terminus site:list`; a header dropdown switches between all sites on the
  account. Pin one with the `pantheonDashboard.site` setting.
- **Multidev switcher** — the dev card's env dropdown lists `dev` plus every
  multidev (`terminus multidev:list`); all dev controls apply to the selected
  env.
- **SFTP / Git mode toggle** — `connection:set`, with a confirm dialog when
  leaving SFTP mode would discard uncommitted changes.
- **SFTP mode** — uncommitted changes on the server (`env:diffstat`) plus a
  commit message box (`env:commit`).
- **Git mode** — local commits on the env's branch (`master` for dev, the env
  name for a multidev) not yet pushed to origin (read-only; commit via git).
- **Test / Live** — commits waiting to be deployed (from Pantheon's
  `env:code-log` environment labels), a deploy-note box, and a Deploy button
  with a confirm dialog (`env:deploy --note`).
- **Workflow-aware spinners** — after every mutating operation the extension
  polls `terminus workflow:list` until all workflows started by the operation
  reach a terminal status; the UI only updates when Pantheon is actually done.

## Requirements

- VS Code 1.85+
- [Terminus](https://docs.pantheon.io/terminus/install) on your shell `PATH`,
  logged in (`terminus auth:login --machine-token=…`)
- The workspace folder is the site's git repo (for Git-mode commit lists)

## Install from this repo

VS Code cannot install an extension directly from a git URL. Two options:

**1. Clone into the extensions folder** (no build step — the extension is plain
JavaScript):

```bash
git clone https://github.com/EarthmanWeb/vscode-pantheon-dashboard.git \
  ~/.vscode/extensions/earthmanweb.pantheon-dashboard-0.1.0
```

Reload VS Code, then opt the workspace in — the extension stays dormant until
the workspace's `.vscode/settings.json` sets:

```json
{ "pantheonDashboard.enabled": true }
```

The status bar then shows `☁ Pantheon`; the
`Pantheon: Open Pantheon Dashboard` command opens the panel.

**2. Package a VSIX:**

```bash
npx @vscode/vsce package
code --install-extension pantheon-dashboard-0.1.0.vsix
```

## Settings

| Setting                     | Default | Purpose                                           |
| --------------------------- | ------- | ------------------------------------------------- |
| `pantheonDashboard.enabled` | `false` | Per-workspace opt-in; dashboard is dormant unless true |
| `pantheonDashboard.site`    | `""`    | Pantheon site machine name; empty = auto-match    |

## Tests

```bash
npm test
```

Unit tests cover the API layer (`src/api.js`) with a stubbed command runner —
no network, no Terminus required.

## Security — no stored secrets

**This repo is public. Never commit secrets, tokens, or `.env` files.**

- The extension stores **no credentials**. Auth is delegated entirely to the
  Terminus session in `~/.terminus/` (machine token), which lives outside any
  repo.
- Commands run via `execFile` with argument arrays — no shell interpolation of
  user input.
- `.gitignore` blocks `.env*` and `*.vsix` as a guard; configuration is limited
  to the non-secret site name.
