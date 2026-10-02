const vscode = require('vscode');
const { DashboardViewProvider } = require('./src/panel');

const activate = (context) => {
  // Per-workspace opt-in: "pantheonDashboard.enabled": true in the workspace's
  // settings (.code-workspace "settings" block, or .vscode/settings.json for a
  // plain folder window). The when-clause context hides the view elsewhere.
  const enabled = vscode.workspace
    .getConfiguration('pantheonDashboard')
    .get('enabled');
  vscode.commands.executeCommand(
    'setContext',
    'pantheonDashboard.enabled',
    !!enabled
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
