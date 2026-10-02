const vscode = require('vscode');
const { DashboardPanel } = require('./src/panel');

const activate = (context) => {
  // Per-workspace opt-in: the extension stays dormant unless the workspace
  // sets "pantheonDashboard.enabled": true in .vscode/settings.json.
  const enabled = vscode.workspace
    .getConfiguration('pantheonDashboard')
    .get('enabled');
  if (!enabled) {
    return;
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('pantheonDashboard.open', () =>
      DashboardPanel.open(context)
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
