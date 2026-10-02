const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { DashboardViewProvider } = require('./src/panel');

// Zero-config gating: the extension only comes alive in a Pantheon repo — a
// workspace folder with pantheon.yml (or pantheon.upstream.yml) at its root.
// activationEvents (workspaceContains) keep it unloaded everywhere else.
const isPantheonWorkspace = () =>
  (vscode.workspace.workspaceFolders || []).some((folder) =>
    ['pantheon.yml', 'pantheon.upstream.yml'].some((name) =>
      fs.existsSync(path.join(folder.uri.fsPath, name))
    )
  );

const activate = (context) => {
  const enabled = isPantheonWorkspace();
  vscode.commands.executeCommand(
    'setContext',
    'pantheonDashboard.enabled',
    enabled
  );
  if (!enabled) {
    return;
  }
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'pantheonDashboard.view',
      new DashboardViewProvider(context)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('pantheonDashboard.open', () =>
      vscode.commands.executeCommand('pantheonDashboard.view.focus')
    )
  );
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0
  );
  item.text = '$(cloud) Pantheon';
  item.tooltip = 'Open Pantheon Dashboard';
  item.command = 'pantheonDashboard.open';
  item.show();
  context.subscriptions.push(item);
};

module.exports = { activate, deactivate: () => {} };
