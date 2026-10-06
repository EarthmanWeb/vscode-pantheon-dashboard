const vscode = require('vscode');
const crypto = require('crypto');
const { PantheonApi, matchSite } = require('./api');

const DOCS_URL = 'https://docs.pantheon.io/terminus/install';

const workspaceRoot = () => {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) {
    throw new Error('Open a workspace folder (the site git repo) first.');
  }
  return folders[0].uri.fsPath;
};

// Contributed webview view — lives in the Activity Bar container and can be
// dragged into the bottom Panel or the secondary sidebar like any view.
class DashboardViewProvider {
  constructor(context) {
    this.extensionUri = context.extensionUri;
  }

  resolveWebviewView(webviewView) {
    this.webview = webviewView.webview;
    this.api = new PantheonApi(workspaceRoot());
    this.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
    };
    this.webview.html = this.html();
    this.webview.onDidReceiveMessage((msg) => this.route(msg));
  }

  async route(msg) {
    if (msg.type === 'reload') {
      vscode.commands.executeCommand('workbench.action.reloadWindow');
      return;
    }
    try {
      const result = await this.handle(msg);
      this.webview.postMessage({ ...result, requestId: msg.requestId });
    } catch (err) {
      this.webview.postMessage({
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
        if (msg.mode === 'git' && !msg.confirmed) {
          const files = await this.api.diffstat(msg.site, msg.env);
          if (files.length) {
            return { type: 'confirmModeSwitch', count: files.length };
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
          commits: await this.api.unpushedCommits(branch, {
            fetch: msg.fetch
          })
        };
      }
      case 'syncContent': {
        const what = [msg.db && 'database', msg.files && 'files']
          .filter(Boolean)
          .join(' and ');
        await this.api.cloneContent(msg.site, msg.from, msg.to, {
          db: msg.db,
          files: msg.files,
          cc: msg.cc
        });
        vscode.window.showInformationMessage(
          `Synced ${what} from ${msg.from} to ${msg.site}.${msg.to}.`
        );
        return { type: 'contentSynced' };
      }
      case 'clearCache': {
        await this.api.clearCache(msg.site, msg.env);
        vscode.window.showInformationMessage(
          `Caches cleared on ${msg.site}.${msg.env}.`
        );
        return { type: 'cacheCleared' };
      }
      case 'push': {
        await this.api.push(msg.site, msg.env, msg.branch);
        if (msg.sync) {
          await this.api.cloneContent(msg.site, msg.sync.from, msg.env, {
            db: msg.sync.db,
            files: msg.sync.files,
            cc: msg.cc
          });
        } else if (msg.cc) {
          await this.api.clearCache(msg.site, msg.env);
        }
        return {
          type: 'unpushed',
          branch: msg.branch,
          commits: await this.api.unpushedCommits(msg.branch)
        };
      }
      case 'pending':
        return {
          type: 'pending',
          env: msg.env,
          commits: await this.api.pendingCommits(msg.site, msg.env)
        };
      case 'workflows':
        return {
          type: 'workflows',
          active: await this.api.activeWorkflows(msg.site)
        };
      case 'deploy': {
        await this.api.deploy(msg.site, msg.env, msg.note, {
          cc: msg.cc && !msg.sync
        });
        if (msg.sync) {
          await this.api.cloneContent(msg.site, msg.sync.from, msg.env, {
            db: msg.sync.db,
            files: msg.sync.files,
            cc: msg.cc
          });
        }
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

  html() {
    const webview = this.webview;
    const nonce = crypto.randomBytes(16).toString('base64');
    const asset = (file) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', file));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${asset('codicons/codicon.css')}">
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

module.exports = { DashboardViewProvider };
