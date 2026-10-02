# Pantheon Dashboard (VS Code extension)

A small dashboard panel inside VS Code for working with a Pantheon-hosted site.
Switch the Dev environment (or a Multidev) between SFTP and Git mode, commit
server changes, push local commits, and deploy Dev → Test → Live — each with a
spinner that waits until Pantheon has actually finished. It appears
automatically whenever you open a Pantheon site folder (one containing
`pantheon.yml`), using the Terminus login you already have on your computer.

## Install (step by step)

> Works on macOS and Linux. You only do steps 1–2 once per computer.

1. **Install Terminus** (Pantheon's command-line tool). On a Mac with
   [Homebrew](https://brew.sh), open the **Terminal** app and run:

   ```bash
   brew install pantheon-systems/external/terminus
   ```

   Other systems: follow
   [Pantheon's Terminus install guide](https://docs.pantheon.io/terminus/install).

2. **Log Terminus in to your Pantheon account.** Create a machine token in the
   Pantheon dashboard ([how](https://docs.pantheon.io/machine-tokens)), then
   run (replace `YOUR_TOKEN`):

   ```bash
   terminus auth:login --machine-token=YOUR_TOKEN
   ```

3. **Open VS Code's terminal**: menu **Terminal → New Terminal**.

4. **Download the extension into VS Code's extensions folder** — paste this
   into that terminal and press Enter:

   ```bash
   git clone https://github.com/EarthmanWeb/vscode-pantheon-dashboard.git ~/.vscode/extensions/earthmanweb.pantheon-dashboard
   ```

5. **Reload VS Code**: press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Linux),
   type **Reload Window**, and press Enter.

6. **Open your Pantheon site's folder** (the one with `pantheon.yml` in it) and
   click the **cloud icon** in the left-hand Activity Bar. The dashboard opens.
   You can drag its tab into the bottom panel or the right sidebar.

**Updating later:** in VS Code's terminal run the command below, then repeat
step 5.

```bash
git -C ~/.vscode/extensions/earthmanweb.pantheon-dashboard pull
```

**Not logged in?** The panel says so and links to the Terminus docs — log in
(step 2), then reload (step 5).

## Features

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
  name for a multidev) not yet pushed to origin, with a **Sync** button that
  pushes them (disabled when there is nothing to sync).
- **Test / Live** — commits waiting to be deployed (from Pantheon's
  `env:code-log` environment labels), a deploy-note box, and a Deploy button
  with a confirm dialog (`env:deploy --note`).
- **Workflow-aware spinners** — after every mutating operation the extension
  polls `terminus workflow:list` until all workflows started by the operation
  reach a terminal status; the UI only updates when Pantheon is actually done.

## Requirements

- VS Code 1.85+ on macOS or Linux
- [Terminus](https://docs.pantheon.io/terminus/install) on your shell `PATH`,
  logged in (`terminus auth:login --machine-token=…`)
- The workspace folder is the site's git repo, with `pantheon.yml` (or
  `pantheon.upstream.yml`) at its root

## Developer install (VSIX)

```bash
npx @vscode/vsce package
code --install-extension pantheon-dashboard-<version>.vsix
```

## Settings

| Setting                  | Default | Purpose                                        |
| ------------------------ | ------- | ---------------------------------------------- |
| `pantheonDashboard.site` | `""`    | Pantheon site machine name; empty = auto-match |

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
