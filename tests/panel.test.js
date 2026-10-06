// DashboardViewProvider (host-side message router) tests, organized by
// Gherkin spec scenario. Test names use the format:
// `<spec slug> › <Scenario title>` matching the corresponding
// tests/specs/dashboard-*.feature file. Each host-side step gets a
// `// Given/When/Then …` comment above the assertion it maps to.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vscodeStub = require('./helpers/vscode-stub');

vscodeStub.install();
const { DashboardViewProvider } = require('../src/panel');

// Fake recording api — async methods that record calls in order and return
// canned data. Each test builds one with the canned responses it needs.
const makeFakeApi = (overrides = {}) => {
  const calls = [];
  const api = {
    calls,
    whoami: async () => 'me@example.test',
    listSites: async () => ['example-site'],
    listMultidevs: async () => ['alpha', 'themes'],
    connectionMode: async () => 'sftp',
    setMode: async (...args) => {
      calls.push(['setMode', ...args]);
      return 'sftp';
    },
    diffstat: async () => [],
    commit: async () => {},
    unpushedCommits: async () => [],
    pendingCommits: async () => [],
    deploy: async () => {},
    clearCache: async () => {},
    cloneContent: async () => {},
    push: async () => {}
  };
  for (const [name, fn] of Object.entries(overrides)) {
    api[name] = async (...args) => {
      calls.push([name, ...args]);
      return fn(...args);
    };
  }
  // Wrap any non-overridden method to also record calls, preserving order.
  for (const name of Object.keys(api)) {
    if (name === 'calls' || overrides[name]) {
      continue;
    }
    const original = api[name];
    api[name] = async (...args) => {
      calls.push([name, ...args]);
      return original(...args);
    };
  }
  return api;
};

const makeProvider = (api) => {
  const provider = new DashboardViewProvider({ extensionUri: { fsPath: '/ext' } });
  provider.api = api;
  return provider;
};

test.beforeEach(() => {
  vscodeStub.reset();
});

test.after(() => {
  vscodeStub.uninstall();
});

// ── dashboard-session.feature ──

test('session › Logged-out user sees the login gate (whoami throws auth error)', async () => {
  const provider = makeProvider(
    makeFakeApi({
      whoami: async () => {
        throw new Error('Please log in to Terminus.');
      }
    })
  );
  // When the dashboard initializes
  const result = await provider.handle({ type: 'init' });
  // Then the "Not logged in to Terminus" message is shown
  // And the Terminus docs link is shown
  assert.deepEqual(result, {
    type: 'loggedOut',
    docsUrl: 'https://docs.pantheon.io/terminus/install'
  });
});

test('session › Logged-out user sees the login gate (empty email)', async () => {
  const provider = makeProvider(makeFakeApi({ whoami: async () => '' }));
  const result = await provider.handle({ type: 'init' });
  assert.deepEqual(result, {
    type: 'loggedOut',
    docsUrl: 'https://docs.pantheon.io/terminus/install'
  });
});

test('session › Reload button asks the host to reload the window', async () => {
  const provider = makeProvider(makeFakeApi());
  // When the user clicks "Reload VS Code"
  await provider.route({ type: 'reload' });
  // Then the host runs the reload-window command
  assert.deepEqual(vscodeStub.getCalls().executeCommand, [
    ['workbench.action.reloadWindow']
  ]);
});

test('session › Configured site setting wins over folder matching', async () => {
  vscodeStub.configure({
    config: { 'pantheonDashboard.site': 'example-site' },
    workspaceFolders: [{ name: 'unrelated-folder', uri: { fsPath: '/tmp/x' } }]
  });
  const provider = makeProvider(
    makeFakeApi({ listSites: async () => ['example-site', 'other-site'] })
  );
  // When the dashboard initializes
  const result = await provider.handle({ type: 'init' });
  // Then the selected site is "example-site"
  assert.equal(result.site, 'example-site');
});

test('session › Site resolved from the workspace folder name wins when no setting configured', async () => {
  vscodeStub.configure({
    config: { 'pantheonDashboard.site': '' },
    workspaceFolders: [{ name: 'acme-site-master', uri: { fsPath: '/tmp/x' } }]
  });
  const provider = makeProvider(
    makeFakeApi({ listSites: async () => ['acme-site', 'other'] })
  );
  const result = await provider.handle({ type: 'init' });
  // Then the selected site is "acme-site"
  assert.equal(result.site, 'acme-site');
});

test('session › Terminus failure during init is shown (non-auth error rethrows)', async () => {
  const provider = makeProvider(
    makeFakeApi({
      whoami: async () => {
        throw new Error('boom');
      }
    })
  );
  // Then the error "boom" is shown
  await assert.rejects(() => provider.handle({ type: 'init' }), /boom/);
});

test('session › Multidev environments populate the dev selector (multidevs route)', async () => {
  const provider = makeProvider(makeFakeApi());
  const result = await provider.handle({ type: 'multidevs', site: 'example-site' });
  assert.deepEqual(result, { type: 'multidevs', envs: ['alpha', 'themes'] });
});

// ── dashboard-connection-mode.feature ──

test('connection-mode › Switching to SFTP mode needs no confirmation', async () => {
  const api = makeFakeApi();
  const provider = makeProvider(api);
  // When the user clicks the "SFTP" toggle
  const result = await provider.handle({
    type: 'setMode',
    site: 'example-site',
    env: 'dev',
    mode: 'sftp'
  });
  // Then the host sets the connection mode to "sftp"
  assert.deepEqual(result, { type: 'devInfo', mode: 'sftp' });
  // And no confirm is shown (diffstat never consulted for sftp mode)
  assert.ok(!api.calls.some((c) => c[0] === 'diffstat'));
  assert.ok(api.calls.some((c) => c[0] === 'setMode'));
});

test('connection-mode › Switching to Git with no uncommitted changes needs no confirmation', async () => {
  const api = makeFakeApi({ diffstat: async () => [] });
  const provider = makeProvider(api);
  const result = await provider.handle({
    type: 'setMode',
    site: 'example-site',
    env: 'dev',
    mode: 'git'
  });
  // Then the host sets the connection mode to "git"
  assert.ok(api.calls.some((c) => c[0] === 'setMode'));
  assert.equal(result.type, 'devInfo');
});

test('connection-mode › Switching to Git with uncommitted changes asks inline', async () => {
  const api = makeFakeApi({
    diffstat: async () => [{ file: 'a.php' }, { file: 'b.php' }]
  });
  const provider = makeProvider(api);
  // When the user clicks the "Git" toggle (not yet confirmed)
  const result = await provider.handle({
    type: 'setMode',
    site: 'example-site',
    env: 'dev',
    mode: 'git',
    confirmed: false
  });
  // Then an inline confirm slides down reading count 2
  assert.deepEqual(result, { type: 'confirmModeSwitch', count: 2 });
  // And the connection mode is not changed yet
  assert.ok(!api.calls.some((c) => c[0] === 'setMode'));
});

test('connection-mode › Confirming the Git switch discards changes (confirmed:true skips diffstat)', async () => {
  const api = makeFakeApi({
    diffstat: async () => {
      throw new Error('diffstat should not be called when confirmed');
    }
  });
  const provider = makeProvider(api);
  // When the user clicks "Switch to Git" with confirmed true
  const result = await provider.handle({
    type: 'setMode',
    site: 'example-site',
    env: 'dev',
    mode: 'git',
    confirmed: true
  });
  // Then the host sets the connection mode to "git" without re-checking diffstat
  assert.equal(result.type, 'devInfo');
  assert.ok(!api.calls.some((c) => c[0] === 'diffstat'));
  assert.ok(api.calls.some((c) => c[0] === 'setMode'));
});

test('connection-mode › diffstat route', async () => {
  const api = makeFakeApi({
    diffstat: async () => [{ file: 'wp-content/a.php', status: 'M' }]
  });
  const provider = makeProvider(api);
  const result = await provider.handle({ type: 'diffstat', site: 'site', env: 'dev' });
  assert.deepEqual(result, {
    type: 'diffstat',
    files: [{ file: 'wp-content/a.php', status: 'M' }]
  });
});

test('connection-mode › commit route (commit then re-reads diffstat)', async () => {
  const api = makeFakeApi({
    diffstat: async () => []
  });
  const provider = makeProvider(api);
  const result = await provider.handle({
    type: 'commit',
    site: 'site',
    env: 'dev',
    message: 'Fix header'
  });
  assert.deepEqual(
    api.calls.map((c) => c[0]),
    ['commit', 'diffstat']
  );
  assert.deepEqual(api.calls[0], ['commit', 'site', 'dev', 'Fix header']);
  assert.deepEqual(result, { type: 'diffstat', files: [] });
});

// ── dashboard-local-commits.feature ──

test('local-commits › unpushed route maps dev -> master branch, passes fetch through', async () => {
  const api = makeFakeApi({ unpushedCommits: async () => [] });
  const provider = makeProvider(api);
  const result = await provider.handle({
    type: 'unpushed',
    site: 'site',
    env: 'dev',
    fetch: false
  });
  assert.equal(result.branch, 'master');
  assert.deepEqual(api.calls[0], ['unpushedCommits', 'master', { fetch: false }]);
});

test('local-commits › unpushed route maps a multidev to its own branch name', async () => {
  const api = makeFakeApi({ unpushedCommits: async () => [] });
  const provider = makeProvider(api);
  const result = await provider.handle({
    type: 'unpushed',
    site: 'site',
    env: 'themes',
    fetch: true
  });
  // A multidev tracks the branch of the same name.
  assert.equal(result.branch, 'themes');
  assert.deepEqual(api.calls[0], ['unpushedCommits', 'themes', { fetch: true }]);
});

test('local-commits › Push only (no clone, no clearCache, order push -> unpushedCommits)', async () => {
  const api = makeFakeApi({ unpushedCommits: async () => [] });
  const provider = makeProvider(api);
  const result = await provider.handle({
    type: 'push',
    site: 'site',
    env: 'dev',
    branch: 'master'
  });
  assert.deepEqual(
    api.calls.map((c) => c[0]),
    ['push', 'unpushedCommits']
  );
  assert.ok(!api.calls.some((c) => c[0] === 'cloneContent'));
  assert.ok(!api.calls.some((c) => c[0] === 'clearCache'));
  assert.deepEqual(result, { type: 'unpushed', branch: 'master', commits: [] });
});

test('local-commits › Push then sync database and clear caches (order push -> cloneContent -> unpushedCommits)', async () => {
  const api = makeFakeApi({ unpushedCommits: async () => [] });
  const provider = makeProvider(api);
  await provider.handle({
    type: 'push',
    site: 'site',
    env: 'dev',
    branch: 'master',
    sync: { from: 'live', db: true, files: false },
    cc: true
  });
  assert.deepEqual(
    api.calls.map((c) => c[0]),
    ['push', 'cloneContent', 'unpushedCommits']
  );
  assert.deepEqual(api.calls[1], [
    'cloneContent',
    'site',
    'live',
    'dev',
    { db: true, files: false, cc: true }
  ]);
});

test('local-commits › Push then clear caches only (order push -> clearCache)', async () => {
  const api = makeFakeApi({ unpushedCommits: async () => [] });
  const provider = makeProvider(api);
  await provider.handle({
    type: 'push',
    site: 'site',
    env: 'dev',
    branch: 'master',
    cc: true
  });
  assert.deepEqual(
    api.calls.map((c) => c[0]),
    ['push', 'clearCache', 'unpushedCommits']
  );
  assert.deepEqual(api.calls[1], ['clearCache', 'site', 'dev']);
});

test('local-commits › Push failure is shown in the card (route posts error)', async () => {
  const api = makeFakeApi({
    push: async () => {
      throw new Error('rejected');
    }
  });
  const provider = makeProvider(api);
  const posted = [];
  provider.webview = { postMessage: (msg) => posted.push(msg) };
  await provider.route({
    type: 'push',
    requestId: 'r1',
    site: 'site',
    env: 'dev',
    branch: 'master'
  });
  assert.deepEqual(posted, [{ type: 'error', requestId: 'r1', message: 'rejected' }]);
});

// ── dashboard-deploy.feature ──

test('deploy › pending route', async () => {
  const api = makeFakeApi({
    pendingCommits: async () => [{ hash: '1', message: 'pending' }]
  });
  const provider = makeProvider(api);
  const result = await provider.handle({ type: 'pending', site: 'site', env: 'test' });
  assert.deepEqual(result, {
    type: 'pending',
    env: 'test',
    commits: [{ hash: '1', message: 'pending' }]
  });
  assert.deepEqual(api.calls[0], ['pendingCommits', 'site', 'test']);
});

test('workflows › workflows route', async () => {
  const active = { dev: ['Sync code on "dev"'] };
  const api = makeFakeApi({ activeWorkflows: async () => active });
  const provider = makeProvider(api);
  const result = await provider.handle({ type: 'workflows', site: 'site' });
  assert.deepEqual(result, { type: 'workflows', active });
  assert.deepEqual(api.calls[0], ['activeWorkflows', 'site']);
});

test('deploy › Deploy only (no clone)', async () => {
  const api = makeFakeApi({ pendingCommits: async () => [] });
  const provider = makeProvider(api);
  await provider.handle({
    type: 'deploy',
    site: 'site',
    env: 'test',
    note: 'Release'
  });
  assert.deepEqual(
    api.calls.map((c) => c[0]),
    ['deploy', 'pendingCommits']
  );
  // api.deploy(site, env, note, { cc: falsy }) — msg.cc is undefined, so
  // `msg.cc && !msg.sync` short-circuits to undefined (falsy), not deployed
  // with caches cleared.
  assert.equal(api.calls[0][0], 'deploy');
  assert.deepEqual(api.calls[0].slice(1, 4), ['site', 'test', 'Release']);
  assert.ok(!api.calls[0][4].cc);
  assert.ok(!api.calls.some((c) => c[0] === 'cloneContent'));
});

test('deploy › Deploy with clear caches only (live, cc only)', async () => {
  const api = makeFakeApi({ pendingCommits: async () => [] });
  const provider = makeProvider(api);
  await provider.handle({
    type: 'deploy',
    site: 'site',
    env: 'live',
    note: 'Release',
    cc: true
  });
  // deploy with { cc: true } since msg.sync is falsy
  assert.deepEqual(api.calls[0], ['deploy', 'site', 'live', 'Release', { cc: true }]);
  assert.ok(!api.calls.some((c) => c[0] === 'cloneContent'));
});

test('deploy › Test deploy then sync database and files (deploy cc:false THEN cloneContent with cc:true)', async () => {
  const api = makeFakeApi({ pendingCommits: async () => [] });
  const provider = makeProvider(api);
  await provider.handle({
    type: 'deploy',
    site: 'site',
    env: 'test',
    note: 'Release',
    cc: true,
    sync: { from: 'live', db: true, files: true }
  });
  assert.deepEqual(
    api.calls.map((c) => c[0]),
    ['deploy', 'cloneContent', 'pendingCommits']
  );
  // deploy({ cc: msg.cc && !msg.sync }) -> cc is false because sync is set
  assert.deepEqual(api.calls[0], ['deploy', 'site', 'test', 'Release', { cc: false }]);
  // cloneContent carries cc: msg.cc (true) regardless of sync.cc field
  assert.deepEqual(api.calls[1], [
    'cloneContent',
    'site',
    'live',
    'test',
    { db: true, files: true, cc: true }
  ]);
});

test('deploy › response type "pending" with fresh commits after deploy', async () => {
  const api = makeFakeApi({
    pendingCommits: async () => [{ hash: 'new' }]
  });
  const provider = makeProvider(api);
  const result = await provider.handle({
    type: 'deploy',
    site: 'site',
    env: 'live',
    note: 'Release'
  });
  assert.deepEqual(result, { type: 'pending', env: 'live', commits: [{ hash: 'new' }] });
});

test('deploy › Deploy failure propagates as an error response', async () => {
  const api = makeFakeApi({
    deploy: async () => {
      throw new Error('Pantheon workflow failed: Deploy code');
    }
  });
  const provider = makeProvider(api);
  const posted = [];
  provider.webview = { postMessage: (msg) => posted.push(msg) };
  await provider.route({
    type: 'deploy',
    requestId: 'r2',
    site: 'site',
    env: 'test',
    note: 'Release'
  });
  assert.deepEqual(posted, [
    { type: 'error', requestId: 'r2', message: 'Pantheon workflow failed: Deploy code' }
  ]);
});

// ── dashboard-clear-caches.feature ──

test('clear-caches › clearCache route calls api.clearCache and returns cacheCleared', async () => {
  const api = makeFakeApi();
  const provider = makeProvider(api);
  const result = await provider.handle({ type: 'clearCache', site: 'site', env: 'test' });
  assert.deepEqual(api.calls[0], ['clearCache', 'site', 'test']);
  assert.deepEqual(result, { type: 'cacheCleared' });
});

test('clear-caches › failure propagates as an error response', async () => {
  const api = makeFakeApi({
    clearCache: async () => {
      throw new Error('denied');
    }
  });
  const provider = makeProvider(api);
  const posted = [];
  provider.webview = { postMessage: (msg) => posted.push(msg) };
  await provider.route({
    type: 'clearCache',
    requestId: 'r3',
    site: 'site',
    env: 'test'
  });
  assert.deepEqual(posted, [{ type: 'error', requestId: 'r3', message: 'denied' }]);
});

// ── dashboard-content-sync.feature ──

test('content-sync › syncContent route calls cloneContent and returns contentSynced', async () => {
  const api = makeFakeApi();
  const provider = makeProvider(api);
  const result = await provider.handle({
    type: 'syncContent',
    site: 'site',
    from: 'live',
    to: 'test',
    db: true,
    files: false,
    cc: true
  });
  assert.deepEqual(api.calls[0], [
    'cloneContent',
    'site',
    'live',
    'test',
    { db: true, files: false, cc: true }
  ]);
  assert.deepEqual(result, { type: 'contentSynced' });
});

test('content-sync › Sync failure propagates as an error response', async () => {
  const api = makeFakeApi({
    cloneContent: async () => {
      throw new Error('clone failed');
    }
  });
  const provider = makeProvider(api);
  const posted = [];
  provider.webview = { postMessage: (msg) => posted.push(msg) };
  await provider.route({
    type: 'syncContent',
    requestId: 'r4',
    site: 'site',
    from: 'live',
    to: 'test',
    db: true,
    files: false
  });
  assert.deepEqual(posted, [{ type: 'error', requestId: 'r4', message: 'clone failed' }]);
});

// ── All routes: no native dialogs remain ──

test('all routes › vscode showWarningMessage is never called by the router', async () => {
  const api = makeFakeApi({
    diffstat: async () => [{ file: 'a.php' }],
    pendingCommits: async () => [{ hash: '1' }],
    unpushedCommits: async () => []
  });
  const provider = makeProvider(api);

  await provider.handle({ type: 'init' });
  await provider.handle({ type: 'multidevs', site: 'site' });
  await provider.handle({ type: 'devInfo', site: 'site', env: 'dev' });
  await provider.handle({
    type: 'setMode',
    site: 'site',
    env: 'dev',
    mode: 'git',
    confirmed: false
  });
  await provider.handle({
    type: 'setMode',
    site: 'site',
    env: 'dev',
    mode: 'git',
    confirmed: true
  });
  await provider.handle({ type: 'diffstat', site: 'site', env: 'dev' });
  await provider.handle({ type: 'commit', site: 'site', env: 'dev', message: 'msg' });
  await provider.handle({ type: 'unpushed', site: 'site', env: 'dev', fetch: true });
  await provider.handle({
    type: 'syncContent',
    site: 'site',
    from: 'live',
    to: 'test',
    db: true,
    files: false
  });
  await provider.handle({ type: 'clearCache', site: 'site', env: 'test' });
  await provider.handle({ type: 'push', site: 'site', env: 'dev', branch: 'master' });
  await provider.handle({ type: 'pending', site: 'site', env: 'test' });
  await provider.handle({ type: 'deploy', site: 'site', env: 'test', note: 'Release' });

  // Then no native confirm dialog is shown anywhere in the router
  assert.equal(vscodeStub.getCalls().showWarningMessage.length, 0);
});

// ── Unknown message type ──

test('router › unknown message type throws "Unknown message type: x"', async () => {
  const provider = makeProvider(makeFakeApi());
  await assert.rejects(
    () => provider.handle({ type: 'x' }),
    /Unknown message type: x/
  );
});

test('router › route() posts unknown-type error with requestId', async () => {
  const provider = makeProvider(makeFakeApi());
  const posted = [];
  provider.webview = { postMessage: (msg) => posted.push(msg) };
  await provider.route({ type: 'bogus', requestId: 'r5' });
  assert.deepEqual(posted, [
    { type: 'error', requestId: 'r5', message: 'Unknown message type: bogus' }
  ]);
});

// ── html() ──

test('html › CSP contains font-src and page links codicon.css and main.css', () => {
  const provider = makeProvider(makeFakeApi());
  const joined = [];
  provider.webview = {
    cspSource: 'vscode-webview://abc',
    asWebviewUri: (uri) => {
      joined.push(uri.fsPath);
      return { toString: () => `https://fake/${uri.fsPath}` };
    }
  };
  const html = provider.html();
  // CSP contains font-src
  assert.match(html, /font-src [^;]+;/);
  assert.match(html, /Content-Security-Policy/);
  // Page links codicons/codicon.css and main.css
  assert.ok(joined.some((p) => p.endsWith('/media/codicons/codicon.css')));
  assert.ok(joined.some((p) => p.endsWith('/media/main.css')));
  assert.ok(joined.some((p) => p.endsWith('/media/main.js')));
});
