const vscode = require('vscode');
const crypto = require('crypto');
const { PantheonApi, matchSite } = require('./api');

const DOCS_URL = 'https://docs.pantheon.io/terminus/install';

let current;

const workspaceRoot = () => {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) {
    throw new Error('Open a workspace folder (the site git repo) first.');
  }
  return folders[0].uri.fsPath;
};

class DashboardPanel {
  static open(context) {
    if (current) {
      current.panel.reveal();
      return;
    }
    current = new DashboardPanel(context);
  }

  constructor(context) {
    this.api = new PantheonApi(workspaceRoot());
    this.panel = vscode.window.createWebviewPanel(
      'pantheonDashboard',
      'Pantheon',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
      }
    );
    this.panel.webview.html = this.html(context.extensionUri);
    this.panel.onDidDispose(() => {
      current = undefined;
    });
    this.panel.webview.onDidReceiveMessage((msg) => this.route(msg));
  }

  async route(msg) {
    if (msg.type === 'reload') {
      vscode.commands.executeCommand('workbench.action.reloadWindow');
      return;
    }
    try {
      const result = await this.handle(msg);
      this.panel.webview.postMessage({ ...result, requestId: msg.requestId });
    } catch (err) {
      this.panel.webview.postMessage({
        type: 'error',
        requestId: msg.requestId,
        message: err.message
      });
    }
  }

  async handle(msg) {
    switch (msg.type) {
      case 'init': {
        let email;
        try {
          email = await this.api.whoami();
        } catch (err) {
          if (/log ?in|auth/i.test(err.message)) {
            return { type: 'loggedOut', docsUrl: DOCS_URL };
          }
          throw err;
        }
        if (!email) {
          return { type: 'loggedOut', docsUrl: DOCS_URL };
        }
        const { site, sites } = await this.resolveSite();
        return { type: 'init', email, site, sites };
      }
      case 'multidevs':
        return { type: 'multidevs', envs: await this.api.listMultidevs(msg.site) };
      case 'devInfo':
        return {
          type: 'devInfo',
          mode: await this.api.connectionMode(msg.site, msg.env)
        };
      case 'setMode': {
        if (msg.mode === 'git') {
          const files = await this.api.diffstat(msg.site, msg.env);
          if (files.length) {
            const choice = await vscode.window.showWarningMessage(
              `Switching ${msg.site}.${msg.env} to Git mode discards ${files.length} uncommitted SFTP change(s).`,
              { modal: true },
              'Switch to Git'
            );
            if (choice !== 'Switch to Git') {
              return { type: 'setModeCancelled' };
            }
          }
        }
        return {
          type: 'devInfo',
          mode: await this.api.setMode(msg.site, msg.env, msg.mode)
        };
      }
      case 'diffstat':
        return {
          type: 'diffstat',
          files: await this.api.diffstat(msg.site, msg.env)
        };
      case 'commit': {
        await this.api.commit(msg.site, msg.env, msg.message);
        return {
          type: 'diffstat',
          files: await this.api.diffstat(msg.site, msg.env)
        };
      }
      case 'unpushed': {
        const branch = msg.env === 'dev' ? 'master' : msg.env;
        return {
          type: 'unpushed',
          branch,
          commits: await this.api.unpushedCommits(branch)
        };
      }
      case 'pending':
        return {
          type: 'pending',
          env: msg.env,
          commits: await this.api.pendingCommits(msg.site, msg.env)
        };
      case 'deploy': {
        const choice = await vscode.window.showWarningMessage(
          `Deploy ${msg.count} commit(s) to ${msg.site}.${msg.env.toUpperCase()}?`,
          { modal: true, detail: `Note: ${msg.note}` },
          'Deploy'
        );
        if (choice !== 'Deploy') {
          return { type: 'deployCancelled', env: msg.env };
        }
        await this.api.deploy(msg.site, msg.env, msg.note);
        vscode.window.showInformationMessage(
          `Deployed to ${msg.site}.${msg.env}.`
        );
        return {
          type: 'pending',
          env: msg.env,
          commits: await this.api.pendingCommits(msg.site, msg.env)
        };
      }
      default:
        throw new Error(`Unknown message type: ${msg.type}`);
    }
  }

  // Explicit setting first, else match the workspace folder name against
  // site:list. site may be null — the webview's site switcher handles it.
  async resolveSite() {
    const sites = await this.api.listSites();
    const configured = vscode.workspace
      .getConfiguration('pantheonDashboard')
      .get('site');
    const site =
      configured ||
      matchSite(sites, vscode.workspace.workspaceFolders[0].name);
    return { site, sites };
  }

  html(extensionUri) {
    const webview = this.panel.webview;
    const nonce = crypto.randomBytes(16).toString('base64');
    const asset = (file) =>
      webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', file));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${asset('main.css')}">
<title>Pantheon</title>
</head>
<body>
<div id="app"><div class="center"><span class="spinner"></span> Checking Terminus login…</div></div>
<script nonce="${nonce}" src="${asset('main.js')}"></script>
</body>
</html>`;
  }
}

module.exports = { DashboardPanel };
