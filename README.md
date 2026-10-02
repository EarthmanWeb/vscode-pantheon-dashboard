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
- **No native pop-ups** — every confirmation (Clear Caches, Sync Content,
  Deploy, Push/"Sync to Dev", and switching to Git with uncommitted SFTP
  changes) is an inline slide-down panel inside the card, not a VS Code modal
  dialog. The spinner and status line only appear after you confirm.
- **SFTP / Git mode toggle** — `connection:set`; switching to Git mode when
  there are uncommitted SFTP changes opens the dev card's inline confirm
  (discarding those changes) before the switch runs.
- **SFTP mode** — uncommitted changes on the server (`env:diffstat`) plus a
  commit message box (`env:commit`).
- **Git mode** — local commits on the env's branch (`master` for dev, the env
  name for a multidev) not yet pushed to origin, with a **Sync** button that
  opens an inline confirm before pushing them (disabled when there is nothing
  to sync).
- **Test / Live** — commits waiting to be deployed (from Pantheon's
  `env:code-log` environment labels), a deploy-note box, and a Deploy button
  that opens an inline confirm before running `env:deploy --note`.
- **Workflow-aware spinners** — after every mutating operation the extension
  polls `terminus workflow:list` until all workflows started by the operation
  reach a terminal status; the UI only updates when Pantheon is actually done.
- **Deploy / push sync options** — the inline confirm for Deploy to Test and
  for Push ("Sync to Dev") also offers "Sync from" (pick any other
  environment, including multidevs), **Database**, **Files** (both unchecked
  by default), and **Clear caches afterwards** (unchecked by default); the
  content sync (`env:clone-content`) runs after the deploy/push workflow
  completes. The inline confirm for a Live deploy only offers **Clear caches
  afterwards** (`env:deploy --cc`) — no sync options.
- **Sync content** — a sync icon next to Clear Caches on the Dev and Test
  cards opens its own slide-down panel: pick any other environment (including
  multidevs) as the source, then tick **Database** and/or **Files** (both
  unchecked by default; Sync stays disabled until at least one is ticked) and
  optionally **Clear caches afterwards** (unchecked by default). There is no
  separate confirm dialog — clicking the panel's own Sync button is the
  confirmation. The spinner waits for the Pantheon clone workflows on the
  target environment (up to 60 minutes). Runs `terminus env:clone-content`.
- **Unpushed local commits** — the Dev card (Git mode) checks the local repo
  every 5 seconds without fetching, so new local commits show up
  automatically as "N unpushed local commit(s)". **Refresh** still fetches
  origin for the up-to-date comparison.
- **Icons** — [Codicons](https://github.com/microsoft/vscode-codicons),
  VS Code's icon font, vendored in `media/codicons` (CC-BY-4.0 / MIT).

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

## Tests / Development

```bash
npm test
```

`npm test` runs the `node:test` suites in `tests/`: the API layer
(`src/api.js`, stubbed command runner), the message router
(`src/panel.js`, with a stubbed `vscode` module), and the webview UI
(`media/main.js`, via `jsdom`) — no network, no Terminus required. Gherkin
specs describing the behavior each suite covers live in `tests/specs/`.

## Security — no stored secrets

**This repo is public. Never commit secrets, tokens, or `.env` files.**

- The extension stores **no credentials**. Auth is delegated entirely to the
  Terminus session in `~/.terminus/` (machine token), which lives outside any
  repo.
- Commands run via `execFile` with argument arrays — no shell interpolation of
  user input.
- `.gitignore` blocks `.env*` and `*.vsix` as a guard; configuration is limited
  to the non-secret site name.
