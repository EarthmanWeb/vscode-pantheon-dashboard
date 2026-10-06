// Webview UI behavior tests (media/main.js), organized by Gherkin spec
// scenario. Test names use the format: `<spec slug> › <Scenario title>`
// matching the corresponding tests/specs/dashboard-*.feature file. Each
// webview-side step gets a `// Given/When/Then …` comment above the
// assertion it maps to. Host-side (src/api.js, src/panel.js) coverage lives
// in tests/api.test.js / tests/panel.test.js — this file only drives
// media/main.js through tests/helpers/webview.js (jsdom).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, boot } = require('./helpers/webview');

const hasSpinner = (h, key) => {
  const elm = h.$(`#${key}-status`);
  return !!(elm && elm.querySelector('.spinner'));
};

// ── dashboard-session.feature ──

test('session › Logged-out user sees the login gate', async () => {
  const h = load();
  const initMsg = await h.nextRequest('init');
  h.consume(initMsg);
  // Given Terminus reports no authenticated user
  h.reply(initMsg, {
    type: 'init',
    type: 'loggedOut',
    docsUrl: 'https://docs.pantheon.io/terminus'
  });
  await new Promise((resolve) => setImmediate(resolve));

  // Then the "Not logged in to Terminus" message is shown
  assert.ok(h.text('.center h2').includes('Not logged in to Terminus'));
  // Then the Terminus docs link is shown
  const link = h.$('.center a');
  assert.ok(link);
  assert.equal(link.getAttribute('href'), 'https://docs.pantheon.io/terminus');
  // Then a "Reload VS Code" button is shown
  assert.equal(h.text('#reload'), 'Reload VS Code');
});

test('session › Reload button asks the host to reload the window', async () => {
  const h = load();
  const initMsg = await h.nextRequest('init');
  h.consume(initMsg);
  // Given the login gate is shown
  h.reply(initMsg, { type: 'loggedOut', docsUrl: 'https://docs.example.test' });
  await new Promise((resolve) => setImmediate(resolve));

  // When the user clicks "Reload VS Code"
  h.click('#reload');
  // Then the host runs the reload-window command
  const reloadMsg = await h.nextRequest('reload');
  assert.equal(reloadMsg.type, 'reload');
});

test('session › No resolvable site prompts for selection', async () => {
  const h = load();
  const initMsg = await h.nextRequest('init');
  h.consume(initMsg);
  // Given no site could be resolved
  h.reply(initMsg, { type: 'init', email: 'user@example.test', site: null, sites: ['a-site', 'b-site'] });
  await new Promise((resolve) => setImmediate(resolve));

  // Then every card shows "Select a site above."
  assert.equal(h.text('#dev-status'), 'Select a site above.');
  assert.equal(h.text('#test-status'), 'Select a site above.');
  assert.equal(h.text('#live-status'), 'Select a site above.');
});

test('session › Switching site refreshes every card', async () => {
  const h = load();
  // Given the dashboard is showing site "example-site"
  await boot(h, { site: 'example-site', sites: ['example-site', 'other-site'] });

  // When the user selects site "other-site"
  const select = h.$('#site-select');
  select.value = 'other-site';
  select.dispatchEvent(new h.window.Event('change', { bubbles: true }));

  // Then the dev, test and live cards reload for "other-site"
  const multidevsMsg = await h.nextRequest('multidevs');
  assert.equal(multidevsMsg.site, 'other-site');
  h.consume(multidevsMsg);
  h.reply(multidevsMsg, { type: 'multidevs', envs: [] });

  const devInfoMsg = await h.nextRequest('devInfo');
  assert.equal(devInfoMsg.site, 'other-site');
  h.consume(devInfoMsg);
  h.reply(devInfoMsg, { type: 'devInfo', mode: 'git' });

  const unpushedMsg = await h.nextRequest('unpushed');
  h.consume(unpushedMsg);
  h.reply(unpushedMsg, { type: 'unpushed', branch: 'master', commits: [] });

  const pendingTestMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'test' && m.site === 'other-site' && !m._consumed);
  h.consume(pendingTestMsg);
  const pendingLiveMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'live' && m.site === 'other-site' && !m._consumed);
  h.consume(pendingLiveMsg);
  h.reply(pendingTestMsg, { type: 'pending', env: 'test', commits: [] });
  h.reply(pendingLiveMsg, { type: 'pending', env: 'live', commits: [] });
});

test('session › Multidev environments populate the dev selector', async () => {
  const h = load();
  // Given the site has multidevs "themes" and "alpha"
  await boot(h, { multidevs: ['themes', 'alpha'] });

  // Then the dev selector lists "dev", "alpha", "themes" in that order
  // (api.listMultidevs sorts — tested in api.test.js; here we assert the
  // webview prepends "dev" to whatever order the host returned).
  const options = [...h.$('#dev-env').querySelectorAll('option')].map((o) => o.value);
  assert.deepEqual(options, ['dev', 'themes', 'alpha']);
});

test('session › Terminus failure during init is shown', async () => {
  const h = load();
  const initMsg = await h.nextRequest('init');
  h.consume(initMsg);
  // Given Terminus fails with "boom"
  h.replyError(initMsg, 'boom');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the error "boom" is shown
  const text = h.text('.center');
  assert.ok(text.includes('boom'));
});

// ── dashboard-connection-mode.feature ──

test('connection-mode › Current mode is shown', async () => {
  const h = load();
  // Given the dev environment is in "sftp" mode
  await boot(h, { devMode: 'sftp', diffstatFiles: [] });

  // Then the mode badge reads "SFTP"
  assert.equal(h.text('#dev-badge'), 'SFTP');
  // Then the "SFTP" toggle button is active
  assert.ok(h.$('#dev-toggle button[data-mode="sftp"]').classList.contains('active'));
  // Then the commit box is visible
  assert.equal(h.$('#dev-commitbox').hidden, false);
});

test('connection-mode › Switching to SFTP mode needs no confirmation', async () => {
  const h = load();
  // Given the dev environment is in "git" mode
  await boot(h, { devMode: 'git', unpushedCommits: [] });

  // When the user clicks the "SFTP" toggle
  h.click('#dev-toggle button[data-mode="sftp"]');
  const setModeMsg = await h.nextRequest('setMode');
  h.consume(setModeMsg);
  // Then the host sets the connection mode to "sftp"
  assert.equal(setModeMsg.mode, 'sftp');
  assert.equal(setModeMsg.confirmed, false);
  // Then no confirm is shown
  assert.ok(!h.$('#dev-confirm').classList.contains('open'));

  // setMode resolving (non-confirmModeSwitch) triggers refreshDev(), which
  // issues a fresh devInfo request.
  h.reply(setModeMsg, { type: 'setMode' });
  const devInfoMsg = await h.nextRequest('devInfo');
  h.consume(devInfoMsg);
  h.reply(devInfoMsg, { type: 'devInfo', mode: 'sftp' });
  const diffstatMsg = await h.nextRequest('diffstat');
  h.consume(diffstatMsg);
  h.reply(diffstatMsg, { type: 'diffstat', files: [] });
  await new Promise((resolve) => setImmediate(resolve));

  // Then the mode badge reads "SFTP" after the workflow completes
  assert.equal(h.text('#dev-badge'), 'SFTP');
});

test('connection-mode › Switching to Git with no uncommitted changes needs no confirmation', async () => {
  const h = load();
  // Given the dev environment is in "sftp" mode with no uncommitted changes
  await boot(h, { devMode: 'sftp', diffstatFiles: [] });

  // When the user clicks the "Git" toggle
  h.click('#dev-toggle button[data-mode="git"]');
  const setModeMsg = await h.nextRequest('setMode');
  h.consume(setModeMsg);
  assert.equal(setModeMsg.mode, 'git');
  assert.equal(setModeMsg.confirmed, false);

  // Then the host sets the connection mode to "git"
  // Then no confirm is shown
  assert.ok(!h.$('#dev-confirm').classList.contains('open'));

  // setMode resolving (non-confirmModeSwitch) triggers refreshDev(), which
  // issues a fresh devInfo request.
  h.reply(setModeMsg, { type: 'setMode' });
  const devInfoMsg = await h.nextRequest('devInfo');
  h.consume(devInfoMsg);
  h.reply(devInfoMsg, { type: 'devInfo', mode: 'git' });
  const unpushedMsg = await h.nextRequest('unpushed');
  h.consume(unpushedMsg);
  h.reply(unpushedMsg, { type: 'unpushed', branch: 'master', commits: [] });
});

test('connection-mode › Switching to Git with uncommitted changes asks inline', async () => {
  const h = load();
  // Given the dev environment is in "sftp" mode with 2 uncommitted changes
  await boot(h, {
    devMode: 'sftp',
    diffstatFiles: [
      { file: 'a.php', status: 'M', additions: 1, deletions: 0 },
      { file: 'b.php', status: 'M', additions: 1, deletions: 0 }
    ]
  });

  // When the user clicks the "Git" toggle
  h.click('#dev-toggle button[data-mode="git"]');
  const setModeMsg = await h.nextRequest('setMode');
  h.consume(setModeMsg);
  h.reply(setModeMsg, { type: 'confirmModeSwitch', count: 2 });
  await new Promise((resolve) => setImmediate(resolve));

  // Then an inline confirm slides down reading the exact message
  assert.ok(h.$('#dev-confirm').classList.contains('open'));
  assert.equal(
    h.text('#dev-confirm-msg'),
    'Switching dev to Git mode discards 2 uncommitted SFTP change(s).'
  );
  // Then the connection mode is not changed yet
  assert.equal(h.text('#dev-badge'), 'SFTP');
  // Then no spinner is shown
  assert.ok(!hasSpinner(h, 'dev'));
});

test('connection-mode › Confirming the Git switch discards changes (resends confirmed:true)', async () => {
  const h = load();
  await boot(h, {
    devMode: 'sftp',
    diffstatFiles: [{ file: 'a.php', status: 'M', additions: 1, deletions: 0 }]
  });

  h.click('#dev-toggle button[data-mode="git"]');
  const setModeMsg = await h.nextRequest('setMode');
  h.consume(setModeMsg);
  h.reply(setModeMsg, { type: 'confirmModeSwitch', count: 1 });
  await new Promise((resolve) => setImmediate(resolve));

  // Given the Git switch confirm is open
  assert.ok(h.$('#dev-confirm').classList.contains('open'));
  // When the user clicks "Switch to Git"
  assert.equal(h.text('#dev-confirm-yes'), 'Switch to Git');
  h.click('#dev-confirm-yes');

  const resendMsg = await h.nextRequest('setMode');
  h.consume(resendMsg);
  // Then the host sets the connection mode to "git" (confirmed resend)
  assert.equal(resendMsg.mode, 'git');
  assert.equal(resendMsg.confirmed, true);
  h.reply(resendMsg, { type: 'setMode' });
  const devInfoMsg = await h.nextRequest('devInfo');
  h.consume(devInfoMsg);
  h.reply(devInfoMsg, { type: 'devInfo', mode: 'git' });
  const unpushedMsg = await h.nextRequest('unpushed');
  h.consume(unpushedMsg);
  h.reply(unpushedMsg, { type: 'unpushed', branch: 'master', commits: [] });
  await new Promise((resolve) => setImmediate(resolve));

  // Then the confirm closes
  assert.ok(!h.$('#dev-confirm').classList.contains('open'));
});

test('connection-mode › Cancelling the Git switch keeps SFTP mode and sends nothing', async () => {
  const h = load();
  await boot(h, {
    devMode: 'sftp',
    diffstatFiles: [{ file: 'a.php', status: 'M', additions: 1, deletions: 0 }]
  });

  h.click('#dev-toggle button[data-mode="git"]');
  const setModeMsg = await h.nextRequest('setMode');
  h.consume(setModeMsg);
  h.reply(setModeMsg, { type: 'confirmModeSwitch', count: 1 });
  await new Promise((resolve) => setImmediate(resolve));

  // Given the Git switch confirm is open
  const postedCountBefore = h.posted.length;
  // When the user clicks "Cancel"
  h.click('#dev-confirm-cancel');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the confirm closes
  assert.ok(!h.$('#dev-confirm').classList.contains('open'));
  // Then the connection mode stays "sftp"
  assert.equal(h.text('#dev-badge'), 'SFTP');
  // Cancel posts nothing further (no new setMode)
  assert.equal(h.posted.length, postedCountBefore);
});

test('connection-mode › Uncommitted SFTP changes are listed', async () => {
  const h = load();
  // Given the dev environment has an uncommitted change to "wp-content/a.php"
  // When the dev card loads in SFTP mode
  await boot(h, {
    devMode: 'sftp',
    diffstatFiles: [{ file: 'wp-content/a.php', status: 'M', additions: 2, deletions: 1 }]
  });

  // Then "wp-content/a.php" is listed with its status, additions and deletions
  const row = h.$('#dev-body table.diffstat tr');
  const cells = [...row.querySelectorAll('td')].map((td) => td.textContent);
  assert.equal(cells[0], 'wp-content/a.php');
  assert.equal(cells[1], 'M');
  assert.equal(cells[2], '+2');
  assert.equal(cells[3], '−1');
});

test('connection-mode › Commit button requires a message', async () => {
  const h = load();
  // Given the dev environment has uncommitted changes (sftp mode, commit box visible)
  await boot(h, { devMode: 'sftp', diffstatFiles: [] });

  // Given the commit message is empty
  // Then the "Commit to dev" button is disabled
  assert.equal(h.$('#dev-commit').disabled, true);
  // When the user types "Fix header"
  h.type('#dev-message', 'Fix header');
  // Then the "Commit to dev" button is enabled
  assert.equal(h.$('#dev-commit').disabled, false);
});

test('connection-mode › Committing SFTP changes', async () => {
  const h = load();
  await boot(h, {
    devMode: 'sftp',
    diffstatFiles: [{ file: 'a.php', status: 'M', additions: 1, deletions: 0 }]
  });
  h.type('#dev-message', 'Fix header');

  // When the user commits with message "Fix header"
  h.click('#dev-commit');
  const commitMsg = await h.nextRequest('commit');
  h.consume(commitMsg);
  // Then the host runs the env commit with message "Fix header"
  assert.equal(commitMsg.message, 'Fix header');
  assert.equal(commitMsg.env, 'dev');

  h.reply(commitMsg, { type: 'diffstat', files: [] });

  // Then the test and live pending lists reload
  const pendingTestMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'test' && !m._consumed);
  h.consume(pendingTestMsg);
  const pendingLiveMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'live' && !m._consumed);
  h.consume(pendingLiveMsg);
  h.reply(pendingTestMsg, { type: 'pending', env: 'test', commits: [] });
  h.reply(pendingLiveMsg, { type: 'pending', env: 'live', commits: [] });
  await new Promise((resolve) => setImmediate(resolve));

  // Then the commit message box is cleared after the workflow completes
  assert.equal(h.$('#dev-message').value, '');
});

test('connection-mode › Selecting a multidev retargets the dev card ("Commit to themes")', async () => {
  const h = load();
  // Given the site has multidev "themes"
  await boot(h, { multidevs: ['themes'], devMode: 'git', unpushedCommits: [] });

  // When the user selects "themes" in the dev selector
  const select = h.$('#dev-env');
  select.value = 'themes';
  select.dispatchEvent(new h.window.Event('change', { bubbles: true }));

  // Then the dev card reloads for "themes"
  const devInfoMsg = await h.nextRequest('devInfo');
  h.consume(devInfoMsg);
  assert.equal(devInfoMsg.env, 'themes');
  // Then the commit button reads "Commit to themes"
  assert.equal(h.text('#dev-commit'), 'Commit to themes');

  h.reply(devInfoMsg, { type: 'devInfo', mode: 'sftp' });
  const diffstatMsg = await h.nextRequest('diffstat');
  h.consume(diffstatMsg);
  h.reply(diffstatMsg, { type: 'diffstat', files: [] });
});

test('connection-mode › Selecting env closes an open dev confirm', async () => {
  const h = load();
  await boot(h, {
    multidevs: ['themes'],
    devMode: 'sftp',
    diffstatFiles: [{ file: 'a.php', status: 'M', additions: 1, deletions: 0 }]
  });

  // Open the dev sync confirm panel
  h.click('[data-sync="dev"]');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(h.$('#dev-confirm').classList.contains('open'));

  const select = h.$('#dev-env');
  select.value = 'themes';
  select.dispatchEvent(new h.window.Event('change', { bubbles: true }));

  // Then the open confirm closes
  assert.ok(!h.$('#dev-confirm').classList.contains('open'));

  const devInfoMsg = await h.nextRequest('devInfo');
  h.consume(devInfoMsg);
  h.reply(devInfoMsg, { type: 'devInfo', mode: 'sftp' });
  const diffstatMsg = await h.nextRequest('diffstat');
  h.consume(diffstatMsg);
  h.reply(diffstatMsg, { type: 'diffstat', files: [] });
});

// ── dashboard-local-commits.feature ──

test('local-commits › Unpushed commits are listed with simplified wording', async () => {
  const h = load();
  // Given local branch "master" has 1 commit not on origin
  await boot(h, {
    devMode: 'git',
    unpushedBranch: 'master',
    unpushedCommits: [
      { hash: 'abc12345', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'Fix header' }
    ]
  });

  // Then the status reads "1 unpushed local commit(s)"
  assert.ok(h.text('#dev-body').includes('1 unpushed local commit(s)'));
  // Then the commit is listed with its message, short hash, date and author
  const commitElm = h.$('#dev-body .commit');
  assert.ok(commitElm.textContent.includes('Fix header'));
  assert.ok(commitElm.textContent.includes('abc12345'.slice(0, 8)));
  assert.ok(commitElm.textContent.includes('Terry'));
  // Then the "Sync to Dev" button is enabled
  assert.equal(h.$('#dev-sync').disabled, false);
});

test('local-commits › Clean branch shows the matching state', async () => {
  const h = load();
  // Given local branch "master" matches origin
  await boot(h, { devMode: 'git', unpushedBranch: 'master', unpushedCommits: [] });

  // Then the status reads "Status: Local master matches origin/master."
  assert.ok(h.text('#dev-body').includes('Status: Local master matches origin/master.'));
  // Then the "Sync to Dev" button is disabled
  assert.equal(h.$('#dev-sync').disabled, true);
});

test('local-commits › A multidev compares its own branch', async () => {
  const h = load();
  // Given the dev selector is on multidev "themes"
  await boot(h, { multidevs: ['themes'], devMode: 'git', unpushedCommits: [] });

  const select = h.$('#dev-env');
  select.value = 'themes';
  select.dispatchEvent(new h.window.Event('change', { bubbles: true }));

  const devInfoMsg = await h.nextRequest('devInfo');
  h.consume(devInfoMsg);
  h.reply(devInfoMsg, { type: 'devInfo', mode: 'git' });

  // Then unpushed commits are computed for "origin/themes..themes"
  // (the webview sends env:"themes"; the origin/..branch range itself is
  // computed host-side — see tests/api.test.js "A multidev compares its own
  // branch" — here we assert the webview requests the right env).
  const unpushedMsg = await h.nextRequest('unpushed');
  h.consume(unpushedMsg);
  assert.equal(unpushedMsg.env, 'themes');
  h.reply(unpushedMsg, { type: 'unpushed', branch: 'themes', commits: [] });
});

test('local-commits › Refresh fetches origin first (webview does not pass fetch:false on load)', async () => {
  const h = load();
  const initMsg = await h.nextRequest('init');
  h.consume(initMsg);
  h.reply(initMsg, { type: 'init', email: 'user@example.test', site: 'example-site', sites: ['example-site'] });
  const multidevsMsg = await h.nextRequest('multidevs');
  h.consume(multidevsMsg);
  h.reply(multidevsMsg, { type: 'multidevs', envs: [] });
  const devInfoMsg = await h.nextRequest('devInfo');
  h.consume(devInfoMsg);
  h.reply(devInfoMsg, { type: 'devInfo', mode: 'git' });

  // When the dev card loads
  const unpushedMsg = await h.nextRequest('unpushed');
  h.consume(unpushedMsg);
  // Then git fetches origin before listing unpushed commits (webview sends
  // no fetch:false flag on a foreground load, unlike the background poll)
  assert.equal(unpushedMsg.fetch, undefined);
  h.reply(unpushedMsg, { type: 'unpushed', branch: 'master', commits: [] });
});

test('local-commits › Background check finds a new local commit without fetching', async () => {
  const h = load();
  // Given the dev card shows 0 unpushed commits
  await boot(h, { devMode: 'git', unpushedBranch: 'master', unpushedCommits: [] });

  // When a commit is made locally, and 5 seconds pass
  h.tick(5000);
  const pollMsg = await h.nextRequest('unpushed');
  h.consume(pollMsg);
  // Then git did not fetch origin for the background check
  assert.equal(pollMsg.fetch, false);
  h.reply(pollMsg, {
    type: 'unpushed',
    branch: 'master',
    commits: [{ hash: 'deadbeef', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'New work' }]
  });
  await new Promise((resolve) => setImmediate(resolve));

  // Then the status reads "1 unpushed local commit(s)"
  assert.ok(h.text('#dev-body').includes('1 unpushed local commit(s)'));
});

test('local-commits › Background check leaves an unchanged list alone', async () => {
  const h = load();
  // Given the dev card shows 1 unpushed commit
  await boot(h, {
    devMode: 'git',
    unpushedBranch: 'master',
    unpushedCommits: [{ hash: 'abc123', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'Fix' }]
  });
  const bodyBefore = h.$('#dev-body').innerHTML;

  // When 5 seconds pass with no new local commits
  h.tick(5000);
  const pollMsg = await h.nextRequest('unpushed');
  h.consume(pollMsg);
  h.reply(pollMsg, {
    type: 'unpushed',
    branch: 'master',
    commits: [{ hash: 'abc123', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'Fix' }]
  });
  await new Promise((resolve) => setImmediate(resolve));

  // Then the commit list is not re-rendered (innerHTML identical — same
  // render call never ran since the signature matched)
  assert.equal(h.$('#dev-body').innerHTML, bodyBefore);
});

test('local-commits › Background check pauses: SFTP mode', async () => {
  const h = load();
  // Given the dev environment is in SFTP mode
  await boot(h, { devMode: 'sftp', diffstatFiles: [] });

  const before = h.posted.filter((m) => m.type === 'unpushed').length;
  // When 5 seconds pass
  h.tick(5000);
  await new Promise((resolve) => setImmediate(resolve));
  // Then no background check is sent
  assert.equal(h.posted.filter((m) => m.type === 'unpushed').length, before);
});

test('local-commits › Background check pauses: dev card is busy', async () => {
  const h = load();
  await boot(h, { devMode: 'git', unpushedCommits: [] });

  // Given the dev card is busy — trigger a refresh and leave it pending
  h.click('#refresh');
  const devInfoMsg = await h.nextRequest('devInfo');
  h.consume(devInfoMsg);
  // (do not reply — card stays busy)

  const before = h.posted.filter((m) => m.type === 'unpushed').length;
  // When 5 seconds pass
  h.tick(5000);
  await new Promise((resolve) => setImmediate(resolve));
  // Then no background check is sent
  assert.equal(h.posted.filter((m) => m.type === 'unpushed').length, before);
});

test('local-commits › Background check pauses: dashboard is hidden', async () => {
  const h = load();
  await boot(h, { devMode: 'git', unpushedCommits: [] });

  // Given the dashboard is hidden
  h.setHidden(true);
  const before = h.posted.filter((m) => m.type === 'unpushed').length;
  // When 5 seconds pass
  h.tick(5000);
  await new Promise((resolve) => setImmediate(resolve));
  // Then no background check is sent
  assert.equal(h.posted.filter((m) => m.type === 'unpushed').length, before);
});

test('local-commits › Push asks inline before running', async () => {
  const h = load();
  // Given local branch "master" has 2 unpushed commits
  await boot(h, {
    devMode: 'git',
    unpushedBranch: 'master',
    unpushedCommits: [
      { hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'one' },
      { hash: 'a2', author: 'Terry', datetime: '2026-10-02T10:01:00-07:00', message: 'two' }
    ]
  });

  // When the user clicks "Sync to Dev"
  h.click('#dev-sync');
  await new Promise((resolve) => setImmediate(resolve));

  // Then an inline confirm slides down reading the exact message
  assert.ok(h.$('#dev-confirm').classList.contains('open'));
  assert.equal(
    h.text('#dev-confirm-msg'),
    'Push 2 commit(s) to origin/master? This deploys to dev.'
  );
  // Then it offers a "Sync from" source list, "Database", "Files" and
  // "Clear caches afterwards", all unchecked
  assert.ok(h.$('#dev-confirm-from'));
  assert.equal(h.$('#dev-confirm-db').checked, false);
  assert.equal(h.$('#dev-confirm-files').checked, false);
  assert.equal(h.$('#dev-confirm-cc').checked, false);
  // Then no spinner is shown
  assert.ok(!hasSpinner(h, 'dev'));
});

test('local-commits › Push source list excludes the target', async () => {
  const h = load();
  // Given the site has multidev "themes"
  await boot(h, {
    multidevs: ['themes'],
    devMode: 'git',
    unpushedBranch: 'master',
    unpushedCommits: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'one' }]
  });

  // When the push confirm opens for "dev"
  h.click('#dev-sync');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the "Sync from" list is "test", "live", "themes"
  const options = [...h.$('#dev-confirm-from').querySelectorAll('option')].map((o) => o.value);
  assert.deepEqual(options, ['test', 'live', 'themes']);
});

test('local-commits › Cancelling the push', async () => {
  const h = load();
  await boot(h, {
    devMode: 'git',
    unpushedBranch: 'master',
    unpushedCommits: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'one' }]
  });

  h.click('#dev-sync');
  await new Promise((resolve) => setImmediate(resolve));
  const before = h.posted.length;

  // When the user clicks "Cancel"
  h.click('#dev-confirm-cancel');
  await new Promise((resolve) => setImmediate(resolve));

  // Then nothing is pushed
  assert.equal(h.posted.filter((m) => m.type === 'push').length, 0);
  assert.equal(h.posted.length, before);
  // Then no spinner is shown
  assert.ok(!hasSpinner(h, 'dev'));
});

test('local-commits › Push only', async () => {
  const h = load();
  await boot(h, {
    devMode: 'git',
    unpushedBranch: 'master',
    unpushedCommits: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'one' }]
  });

  h.click('#dev-sync');
  await new Promise((resolve) => setImmediate(resolve));

  // Given the push confirm is open with nothing ticked
  // When the user clicks "Push"
  h.click('#dev-confirm-yes');
  const pushMsg = await h.nextRequest('push');
  h.consume(pushMsg);

  // Then git pushes "master" to origin (branch param) and the host waits
  // for the dev workflows (host-side — see api.test.js); here we assert the
  // payload the webview sends.
  assert.equal(pushMsg.branch, 'master');
  assert.equal(pushMsg.env, 'dev');
  // Then no content is cloned and no caches are cleared
  assert.equal(pushMsg.sync, null);
  assert.equal(pushMsg.cc, false);

  h.reply(pushMsg, { type: 'unpushed', branch: 'master', commits: [] });

  // Then the test and live pending lists reload
  const pendingTestMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'test' && !m._consumed);
  h.consume(pendingTestMsg);
  const pendingLiveMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'live' && !m._consumed);
  h.consume(pendingLiveMsg);
  h.reply(pendingTestMsg, { type: 'pending', env: 'test', commits: [] });
  h.reply(pendingLiveMsg, { type: 'pending', env: 'live', commits: [] });
});

test('local-commits › Push then sync database and clear caches', async () => {
  const h = load();
  await boot(h, {
    multidevs: [],
    devMode: 'git',
    unpushedBranch: 'master',
    unpushedCommits: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'one' }]
  });

  h.click('#dev-sync');
  await new Promise((resolve) => setImmediate(resolve));

  // Given "Sync from" is "live" with "Database" and "Clear caches afterwards" ticked
  h.$('#dev-confirm-from').value = 'live';
  h.check('#dev-confirm-db', true);
  h.check('#dev-confirm-cc', true);

  // When the user clicks "Push"
  h.click('#dev-confirm-yes');
  const pushMsg = await h.nextRequest('push');
  h.consume(pushMsg);

  // Then push carries sync { from: live, db: true, files: false } and cc: true
  // (sync is an object literal from the jsdom realm, so compare fields
  // individually rather than with deepEqual across realms)
  assert.equal(pushMsg.sync.from, 'live');
  assert.equal(pushMsg.sync.db, true);
  assert.equal(pushMsg.sync.files, false);
  assert.equal(pushMsg.cc, true);

  h.reply(pushMsg, { type: 'unpushed', branch: 'master', commits: [] });
  const pendingTestMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'test' && !m._consumed);
  h.consume(pendingTestMsg);
  const pendingLiveMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'live' && !m._consumed);
  h.consume(pendingLiveMsg);
  h.reply(pendingTestMsg, { type: 'pending', env: 'test', commits: [] });
  h.reply(pendingLiveMsg, { type: 'pending', env: 'live', commits: [] });
});

test('local-commits › Push then clear caches only', async () => {
  const h = load();
  await boot(h, {
    devMode: 'git',
    unpushedBranch: 'master',
    unpushedCommits: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'one' }]
  });

  h.click('#dev-sync');
  await new Promise((resolve) => setImmediate(resolve));

  // Given the push confirm is open with only "Clear caches afterwards" ticked
  h.check('#dev-confirm-cc', true);
  h.click('#dev-confirm-yes');
  const pushMsg = await h.nextRequest('push');
  h.consume(pushMsg);

  // Then sync stays null (no db/files ticked) and cc is true
  assert.equal(pushMsg.sync, null);
  assert.equal(pushMsg.cc, true);

  h.reply(pushMsg, { type: 'unpushed', branch: 'master', commits: [] });
  const pendingTestMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'test' && !m._consumed);
  h.consume(pendingTestMsg);
  const pendingLiveMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'live' && !m._consumed);
  h.consume(pendingLiveMsg);
  h.reply(pendingTestMsg, { type: 'pending', env: 'test', commits: [] });
  h.reply(pendingLiveMsg, { type: 'pending', env: 'live', commits: [] });
});

test('local-commits › Push failure is shown in the card', async () => {
  const h = load();
  await boot(h, {
    devMode: 'git',
    unpushedBranch: 'master',
    unpushedCommits: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'one' }]
  });

  h.click('#dev-sync');
  await new Promise((resolve) => setImmediate(resolve));
  h.click('#dev-confirm-yes');
  const pushMsg = await h.nextRequest('push');
  h.consume(pushMsg);

  // Given git push fails with "rejected"
  h.replyError(pushMsg, 'rejected');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the dev card shows the error "rejected"
  assert.ok(h.text('#dev-status').includes('rejected'));
});

// ── dashboard-deploy.feature ──

test('deploy › Up-to-date environment', async () => {
  const h = load();
  // Given nothing is pending for test
  await boot(h, { pendingTest: [], pendingLive: [] });

  // Then the test card reads "Up to date with dev — nothing to deploy."
  assert.ok(h.text('#test-body').includes('Up to date with dev — nothing to deploy.'));
  // Then the badge reads "0 pending"
  assert.equal(h.text('#test-badge'), '0 pending');
});

test('deploy › Deploy note is prefilled from pending commit messages', async () => {
  const h = load();
  // Given 2 commits are pending for test with messages "Fix header" and "Add footer"
  // When the test card loads
  await boot(h, {
    pendingTest: [
      { hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'Fix header' },
      { hash: 'a2', author: 'Terry', datetime: '2026-10-02T11:00:00-07:00', message: 'Add footer' }
    ]
  });

  // Then the deploy note reads "Fix header" and "Add footer" on separate lines
  assert.equal(h.$('#test-note').value, 'Fix header\nAdd footer');
  // Then the "Deploy Dev → Test" button is enabled
  assert.equal(h.$('#test-deploy').disabled, false);
});

test('deploy › Edited deploy note survives a pending list reload', async () => {
  const h = load();
  // Given 1 commit is pending for test and the note is "Release"
  await boot(h, { pendingTest: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'x' }] });
  h.type('#test-note', 'Release');

  // When the test pending list reloads
  h.click('#refresh');
  const pendingMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'test' && !m._consumed);
  h.consume(pendingMsg);
  h.reply(pendingMsg, { type: 'pending', env: 'test', commits: [{ hash: 'a2', author: 'Terry', datetime: '2026-10-02T11:00:00-07:00', message: 'y' }] });
  await new Promise((resolve) => setImmediate(resolve));

  // Then the deploy note is still "Release"
  assert.equal(h.$('#test-note').value, 'Release');
});

test('deploy › Clearing the deploy note', async () => {
  const h = load();
  // Given 1 commit is pending for test
  await boot(h, { pendingTest: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'x' }] });
  assert.equal(h.$('#test-note').value, 'x');

  // When the user clicks the clear (X) button on the deploy note
  h.click('#test-note-clear');

  // Then the deploy note is empty
  assert.equal(h.$('#test-note').value, '');
  // Then the "Deploy Dev → Test" button is disabled
  assert.equal(h.$('#test-deploy').disabled, true);
});

test('deploy › Deploy button requires a note and pending commits', async () => {
  const h = load();
  // Given 1 commit is pending for test
  await boot(h, {
    pendingTest: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'x' }]
  });

  // And the deploy note is cleared
  h.click('#test-note-clear');
  // Then the "Deploy Dev → Test" button is disabled
  assert.equal(h.$('#test-deploy').disabled, true);
  // When the user types note "Release"
  h.type('#test-note', 'Release');
  // Then the "Deploy Dev → Test" button is enabled
  assert.equal(h.$('#test-deploy').disabled, false);
});

test('deploy › Test deploy asks inline with sync options', async () => {
  const h = load();
  // Given 1 commit is pending for test and the note is "Release"
  await boot(h, {
    pendingTest: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'x' }]
  });
  h.type('#test-note', 'Release');

  // When the user clicks "Deploy Dev → Test"
  h.click('#test-deploy');
  await new Promise((resolve) => setImmediate(resolve));

  // Then an inline confirm slides down reading the exact message
  assert.ok(h.$('#test-confirm').classList.contains('open'));
  assert.equal(h.text('#test-confirm-msg'), 'Deploy 1 commit(s) to TEST?');
  // Then it offers a "Sync from" source list, "Database", "Files" and
  // "Clear caches afterwards", all unchecked
  assert.ok(h.$('#test-confirm-from'));
  assert.equal(h.$('#test-confirm-db').checked, false);
  assert.equal(h.$('#test-confirm-files').checked, false);
  assert.equal(h.$('#test-confirm-cc').checked, false);
  // Then no spinner is shown
  assert.ok(!hasSpinner(h, 'test'));
});

test('deploy › Live deploy asks inline with clear caches only', async () => {
  const h = load();
  // Given 1 commit is pending for live and the note is "Release"
  await boot(h, {
    pendingLive: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'x' }]
  });
  h.type('#live-note', 'Release');

  // When the user clicks "Deploy Test → Live"
  h.click('#live-deploy');
  await new Promise((resolve) => setImmediate(resolve));

  // Then an inline confirm slides down reading the exact message
  assert.ok(h.$('#live-confirm').classList.contains('open'));
  assert.equal(h.text('#live-confirm-msg'), 'Deploy 1 commit(s) to LIVE?');
  // Then it offers "Clear caches afterwards" unchecked
  assert.ok(h.$('#live-confirm-cc'));
  assert.equal(h.$('#live-confirm-cc').checked, false);
  // Then it offers no "Sync from", "Database" or "Files" options
  assert.equal(h.$('#live-confirm-from'), null);
  assert.equal(h.$('#live-confirm-db'), null);
  assert.equal(h.$('#live-confirm-files'), null);
});

test('deploy › Cancelling a deploy', async () => {
  const h = load();
  // Given the test deploy confirm is open
  await boot(h, {
    pendingTest: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'x' }]
  });
  h.type('#test-note', 'Release');
  h.click('#test-deploy');
  await new Promise((resolve) => setImmediate(resolve));

  // When the user clicks "Cancel"
  h.click('#test-confirm-cancel');
  await new Promise((resolve) => setImmediate(resolve));

  // Then nothing is deployed
  assert.equal(h.posted.filter((m) => m.type === 'deploy').length, 0);
  // Then the deploy note is kept
  assert.equal(h.$('#test-note').value, 'Release');
});

test('deploy › Deploy only', async () => {
  const h = load();
  // Given the test deploy confirm is open with nothing ticked
  await boot(h, {
    pendingTest: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'x' }]
  });
  h.type('#test-note', 'Release');
  h.click('#test-deploy');
  await new Promise((resolve) => setImmediate(resolve));

  // When the user clicks "Deploy"
  h.click('#test-confirm-yes');
  const deployMsg = await h.nextRequest('deploy');
  h.consume(deployMsg);

  // Then the host deploys to test with note "Release" and without clearing caches
  assert.equal(deployMsg.env, 'test');
  assert.equal(deployMsg.note, 'Release');
  assert.equal(deployMsg.cc, false);
  assert.equal(deployMsg.sync, null);

  h.reply(deployMsg, { type: 'pending', commits: [] });

  // Then the live pending list reloads
  const pendingLiveMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'live' && !m._consumed);
  h.consume(pendingLiveMsg);
  h.reply(pendingLiveMsg, { type: 'pending', env: 'live', commits: [] });
  await new Promise((resolve) => setImmediate(resolve));

  // Then the deploy note is cleared after the workflows complete
  assert.equal(h.$('#test-note').value, '');
});

test('deploy › Deploy locks the note and button until the workflows complete', async () => {
  const h = load();
  const locked = () =>
    ['#test-note', '#test-note-clear', '#test-deploy'].map((sel) => h.$(sel).disabled);
  // Given 1 commit is pending for test and the note is "Release"
  await boot(h, { pendingTest: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'x' }] });
  h.type('#test-note', 'Release');

  // When the user clicks "Deploy Dev → Test"
  h.click('#test-deploy');
  await new Promise((resolve) => setImmediate(resolve));
  // Then the deploy note, its clear button and the deploy button are disabled
  assert.deepEqual(locked(), [true, true, true]);

  // When the user clicks "Deploy"
  h.click('#test-confirm-yes');
  const deployMsg = await h.nextRequest('deploy');
  h.consume(deployMsg);
  // Then they stay disabled while the deploy workflows run
  assert.deepEqual(locked(), [true, true, true]);

  // When the deploy workflows complete
  h.reply(deployMsg, { type: 'pending', commits: [{ hash: 'a2', author: 'Terry', datetime: '2026-10-02T11:00:00-07:00', message: 'y' }] });
  const pendingLiveMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'live' && !m._consumed);
  h.consume(pendingLiveMsg);
  h.reply(pendingLiveMsg, { type: 'pending', env: 'live', commits: [] });
  await new Promise((resolve) => setImmediate(resolve));
  // Then the deploy note and its clear button are enabled
  assert.equal(h.$('#test-note').disabled, false);
  assert.equal(h.$('#test-note-clear').disabled, false);
});

test('deploy › Cancelling a deploy unlocks the note', async () => {
  const h = load();
  // Given the test deploy confirm is open
  await boot(h, { pendingTest: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'x' }] });
  h.type('#test-note', 'Release');
  h.click('#test-deploy');
  await new Promise((resolve) => setImmediate(resolve));

  // When the user clicks "Cancel"
  h.click('#test-confirm-cancel');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the deploy note, its clear button and the deploy button are enabled
  assert.equal(h.$('#test-note').disabled, false);
  assert.equal(h.$('#test-note-clear').disabled, false);
  assert.equal(h.$('#test-deploy').disabled, false);
});

test('deploy › Deploy with clear caches only', async () => {
  const h = load();
  // Given the live deploy confirm is open with "Clear caches afterwards" ticked
  await boot(h, {
    pendingLive: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'x' }]
  });
  h.type('#live-note', 'Release');
  h.click('#live-deploy');
  await new Promise((resolve) => setImmediate(resolve));
  h.check('#live-confirm-cc', true);

  // When the user clicks "Deploy"
  h.click('#live-confirm-yes');
  const deployMsg = await h.nextRequest('deploy');
  h.consume(deployMsg);

  // Then the host deploys to live with caches cleared
  assert.equal(deployMsg.env, 'live');
  assert.equal(deployMsg.cc, true);

  h.reply(deployMsg, { type: 'pending', commits: [] });
});

test('deploy › Test deploy then sync database and files', async () => {
  const h = load();
  await boot(h, {
    multidevs: [],
    pendingTest: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'x' }]
  });
  h.type('#test-note', 'Release');
  h.click('#test-deploy');
  await new Promise((resolve) => setImmediate(resolve));

  // Given "Sync from" is "live" with "Database", "Files" and "Clear caches
  // afterwards" ticked
  h.$('#test-confirm-from').value = 'live';
  h.check('#test-confirm-db', true);
  h.check('#test-confirm-files', true);
  h.check('#test-confirm-cc', true);

  // When the user clicks "Deploy"
  h.click('#test-confirm-yes');
  const deployMsg = await h.nextRequest('deploy');
  h.consume(deployMsg);

  // Then the host deploys to test without clearing caches on the deploy
  // itself; caches are cleared as part of the subsequent sync instead
  // (compare fields individually — sync is an object literal from the
  // jsdom realm, not reference-equal to a same-shape Node-realm object)
  assert.equal(deployMsg.sync.from, 'live');
  assert.equal(deployMsg.sync.db, true);
  assert.equal(deployMsg.sync.files, true);
  assert.equal(deployMsg.cc, true);

  h.reply(deployMsg, { type: 'pending', commits: [] });
  const pendingLiveMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'live' && !m._consumed);
  h.consume(pendingLiveMsg);
  h.reply(pendingLiveMsg, { type: 'pending', env: 'live', commits: [] });
});

test('deploy › Deploy failure still reloads downstream lists', async () => {
  const h = load();
  // Given the deploy workflow fails
  await boot(h, {
    pendingTest: [{ hash: 'a1', author: 'Terry', datetime: '2026-10-02T10:00:00-07:00', message: 'x' }]
  });
  h.type('#test-note', 'Release');
  h.click('#test-deploy');
  await new Promise((resolve) => setImmediate(resolve));

  // When the user confirms a test deploy
  h.click('#test-confirm-yes');
  const deployMsg = await h.nextRequest('deploy');
  h.consume(deployMsg);
  h.replyError(deployMsg, 'Pantheon workflow failed');

  // Then the test card shows "Pantheon workflow failed"
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(h.text('#test-status').includes('Pantheon workflow failed'));

  // Then the live pending list reloads
  const pendingLiveMsg = await h.waitFor((m) => m.type === 'pending' && m.env === 'live' && !m._consumed);
  h.consume(pendingLiveMsg);
  h.reply(pendingLiveMsg, { type: 'pending', env: 'live', commits: [] });
});

// ── dashboard-clear-caches.feature ──

for (const [card, env] of [['dev', 'dev'], ['test', 'test'], ['live', 'live']]) {
  test(`clear-caches › Clear caches asks inline (${card})`, async () => {
    const h = load();
    await boot(h, { devMode: 'git', unpushedCommits: [] });

    // When the user clicks the Clear Caches icon on the <card> card
    h.click(`[data-clear="${card}"]`);
    await new Promise((resolve) => setImmediate(resolve));

    // Then an inline confirm slides down reading "Clear all caches on <env>?"
    assert.ok(h.$(`#${card}-confirm`).classList.contains('open'));
    assert.equal(h.text(`#${card}-confirm-msg`), `Clear all caches on ${env}?`);
    // Then no spinner or status message is shown
    assert.equal(h.text(`#${card}-status`).trim(), '');
  });
}

test('clear-caches › The dev card targets the selected multidev', async () => {
  const h = load();
  // Given the dev selector is on multidev "themes"
  await boot(h, { multidevs: ['themes'], devMode: 'git', unpushedCommits: [] });
  const select = h.$('#dev-env');
  select.value = 'themes';
  select.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  const devInfoMsg = await h.nextRequest('devInfo');
  h.consume(devInfoMsg);
  h.reply(devInfoMsg, { type: 'devInfo', mode: 'git' });
  const unpushedMsg = await h.nextRequest('unpushed');
  h.consume(unpushedMsg);
  h.reply(unpushedMsg, { type: 'unpushed', branch: 'themes', commits: [] });
  await new Promise((resolve) => setImmediate(resolve));

  // When the user clicks the Clear Caches icon on the dev card
  h.click('[data-clear="dev"]');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the confirm reads "Clear all caches on themes?"
  assert.equal(h.text('#dev-confirm-msg'), 'Clear all caches on themes?');
});

test('clear-caches › Confirming clears caches', async () => {
  const h = load();
  // Given the clear caches confirm is open on the test card
  await boot(h, {});
  h.click('[data-clear="test"]');
  await new Promise((resolve) => setImmediate(resolve));

  // When the user clicks "Yes"
  h.click('#test-confirm-yes');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the confirm closes
  assert.ok(!h.$('#test-confirm').classList.contains('open'));
  // Then the status shows a spinner with "Clearing caches on test…"
  assert.ok(hasSpinner(h, 'test'));
  assert.ok(h.text('#test-status').includes('Clearing caches on test…'));
  // Then the status does not mention "waiting for Pantheon"
  assert.ok(!h.text('#test-status').includes('waiting for Pantheon'));

  // Then the host clears caches on test and waits for its workflows
  // (waiting happens host-side; see api.test.js)
  const clearMsg = await h.nextRequest('clearCache');
  h.consume(clearMsg);
  assert.equal(clearMsg.env, 'test');

  h.reply(clearMsg, { type: 'cacheCleared' });
  await new Promise((resolve) => setImmediate(resolve));

  // Then the status reads "Caches cleared on test."
  assert.ok(h.text('#test-status').includes('Caches cleared on test.'));
});

test('clear-caches › Cancelling leaves the card unchanged', async () => {
  const h = load();
  // Given the clear caches confirm is open on the test card
  await boot(h, {});
  h.click('[data-clear="test"]');
  await new Promise((resolve) => setImmediate(resolve));

  // When the user clicks "Cancel"
  h.click('#test-confirm-cancel');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the confirm closes
  assert.ok(!h.$('#test-confirm').classList.contains('open'));
  // Then caches are not cleared
  assert.equal(h.posted.filter((m) => m.type === 'clearCache').length, 0);
  // Then no spinner or status message is shown
  assert.equal(h.text('#test-status').trim(), '');
});

test('clear-caches › Clear caches failure is shown', async () => {
  const h = load();
  await boot(h, {});
  h.click('[data-clear="test"]');
  await new Promise((resolve) => setImmediate(resolve));
  h.click('#test-confirm-yes');

  // Given clearing caches fails with "denied"
  const clearMsg = await h.nextRequest('clearCache');
  h.consume(clearMsg);
  h.replyError(clearMsg, 'denied');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the test card shows the error "denied"
  assert.ok(h.text('#test-status').includes('denied'));
});

// ── dashboard-content-sync.feature ──

test('content-sync › Sync icon on dev and test only', async () => {
  const h = load();
  await boot(h, {});

  // Then the dev and test cards have a Sync Content icon
  assert.ok(h.$('[data-sync="dev"]'));
  assert.ok(h.$('[data-sync="test"]'));
  // Then the live card has no Sync Content icon
  assert.equal(h.$('[data-sync="live"]'), null);
});

test('content-sync › Opening the panel', async () => {
  const h = load();
  // Given the site has multidev "themes"
  await boot(h, { multidevs: ['themes'] });

  // When the user clicks the Sync Content icon on the test card
  h.click('[data-sync="test"]');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the panel slides down
  assert.ok(h.$('#test-confirm').classList.contains('open'));
  // Then "Sync from" lists "dev", "live", "themes"
  const options = [...h.$('#test-confirm-from').querySelectorAll('option')].map((o) => o.value);
  assert.deepEqual(options, ['dev', 'live', 'themes']);
  // Then "Database", "Files" and "Clear caches afterwards" are unchecked
  assert.equal(h.$('#test-confirm-db').checked, false);
  assert.equal(h.$('#test-confirm-files').checked, false);
  assert.equal(h.$('#test-confirm-cc').checked, false);
  // Then the "Sync" button is disabled
  assert.equal(h.$('#test-confirm-yes').disabled, true);
});

const tickOutline = [
  { ticked: 'nothing', state: 'disabled' },
  { ticked: 'Clear caches afterwards', state: 'disabled' },
  { ticked: 'Database', state: 'enabled' },
  { ticked: 'Files', state: 'enabled' }
];

for (const { ticked, state } of tickOutline) {
  test(`content-sync › Sync button needs database or files (${ticked})`, async () => {
    const h = load();
    // Given the sync panel is open on the test card
    await boot(h, {});
    h.click('[data-sync="test"]');
    await new Promise((resolve) => setImmediate(resolve));

    // When the user ticks <ticked>
    if (ticked === 'Clear caches afterwards') {
      h.check('#test-confirm-cc', true);
    } else if (ticked === 'Database') {
      h.check('#test-confirm-db', true);
    } else if (ticked === 'Files') {
      h.check('#test-confirm-files', true);
    }

    // Then the "Sync" button is <state>
    assert.equal(h.$('#test-confirm-yes').disabled, state === 'disabled');
  });
}

const syncOutline = [
  { label: 'Database', set: (h) => h.check('#test-confirm-db', true), flags: ['--db-only'] },
  { label: 'Files', set: (h) => h.check('#test-confirm-files', true), flags: ['--files-only'] },
  {
    label: 'Database and Files',
    set: (h) => {
      h.check('#test-confirm-db', true);
      h.check('#test-confirm-files', true);
    },
    flags: []
  },
  {
    label: 'Database and Clear caches afterwards',
    set: (h) => {
      h.check('#test-confirm-db', true);
      h.check('#test-confirm-cc', true);
    },
    flags: ['--db-only', '--cc']
  }
];

for (const { label, set, flags } of syncOutline) {
  test(`content-sync › Syncing runs the matching clone (${label})`, async () => {
    const h = load();
    // Given the sync panel is open on the test card with "Sync from" "live"
    await boot(h, {});
    const postedBefore = h.posted.length;
    h.click('[data-sync="test"]');
    await new Promise((resolve) => setImmediate(resolve));
    h.$('#test-confirm-from').value = 'live';
    // And <ticked> ticked
    set(h);

    // When the user clicks "Sync"
    h.click('#test-confirm-yes');
    const syncMsg = await h.nextRequest('syncContent');
    h.consume(syncMsg);

    // Then no native dialog is shown — only postMessage traffic exists;
    // nothing in this harness can open a native dialog from the webview.
    assert.equal(syncMsg.from, 'live');
    assert.equal(syncMsg.to, 'test');
    // Then the host clones from "live" to "test" with flags "<flags>"
    // (flag translation is host-side — see api.test.js; the webview sends
    // the booleans that drive those flags)
    if (flags.includes('--db-only')) {
      assert.equal(syncMsg.db, true);
      assert.equal(syncMsg.files, false);
    }
    if (flags.includes('--files-only')) {
      assert.equal(syncMsg.files, true);
      assert.equal(syncMsg.db, false);
    }
    if (flags.length === 0) {
      assert.equal(syncMsg.db, true);
      assert.equal(syncMsg.files, true);
    }
    assert.equal(syncMsg.cc, flags.includes('--cc'));

    h.reply(syncMsg, { type: 'contentSynced' });
    await new Promise((resolve) => setImmediate(resolve));

    // Then the status reads "Synced live → test."
    assert.ok(h.text('#test-status').includes('Synced live → test.'));
    // Then the panel closes with every box unchecked
    assert.ok(!h.$('#test-confirm').classList.contains('open'));
  });
}

test('content-sync › Cancelling closes and resets the panel', async () => {
  const h = load();
  // Given the sync panel is open with "Database" ticked
  await boot(h, {});
  h.click('[data-sync="test"]');
  await new Promise((resolve) => setImmediate(resolve));
  h.check('#test-confirm-db', true);

  // When the user clicks "Cancel"
  h.click('#test-confirm-cancel');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the panel closes
  assert.ok(!h.$('#test-confirm').classList.contains('open'));
  // Then every box is unchecked (fields are cleared from the DOM on close)
  assert.equal(h.$('#test-confirm-db'), null);
});

test('content-sync › Changing the dev environment closes the dev panel', async () => {
  const h = load();
  // Given the sync panel is open on the dev card
  await boot(h, { multidevs: ['themes'], devMode: 'git', unpushedCommits: [] });
  h.click('[data-sync="dev"]');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(h.$('#dev-confirm').classList.contains('open'));

  // When the user selects multidev "themes"
  const select = h.$('#dev-env');
  select.value = 'themes';
  select.dispatchEvent(new h.window.Event('change', { bubbles: true }));

  // Then the dev sync panel closes
  assert.ok(!h.$('#dev-confirm').classList.contains('open'));

  const devInfoMsg = await h.nextRequest('devInfo');
  h.consume(devInfoMsg);
  h.reply(devInfoMsg, { type: 'devInfo', mode: 'git' });
  const unpushedMsg = await h.nextRequest('unpushed');
  h.consume(unpushedMsg);
  h.reply(unpushedMsg, { type: 'unpushed', branch: 'themes', commits: [] });
});

test('content-sync › icon toggles closed (clicking Sync icon again while open)', async () => {
  const h = load();
  await boot(h, {});
  h.click('[data-sync="test"]');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(h.$('#test-confirm').classList.contains('open'));

  // Clicking the sync icon again while the sync panel is open closes it
  h.click('[data-sync="test"]');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!h.$('#test-confirm').classList.contains('open'));
});

test('content-sync › Sync failure is shown', async () => {
  const h = load();
  // Given the clone fails with "clone failed"
  await boot(h, {});
  // When the user syncs the test card
  h.click('[data-sync="test"]');
  await new Promise((resolve) => setImmediate(resolve));
  h.check('#test-confirm-db', true);
  h.click('#test-confirm-yes');
  const syncMsg = await h.nextRequest('syncContent');
  h.consume(syncMsg);
  h.replyError(syncMsg, 'clone failed');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the test card shows the error "clone failed"
  assert.ok(h.text('#test-status').includes('clone failed'));
});

// ── dashboard-workflows.feature ──

test('workflows › Errors reach the card that started the operation', async () => {
  const h = load();
  // Given a host operation fails with "stderr text"
  await boot(h, {});
  h.click('[data-clear="live"]');
  await new Promise((resolve) => setImmediate(resolve));
  h.click('#live-confirm-yes');

  // When the webview receives the error response
  const clearMsg = await h.nextRequest('clearCache');
  h.consume(clearMsg);
  h.replyError(clearMsg, 'stderr text');
  await new Promise((resolve) => setImmediate(resolve));

  // Then the card that sent the request shows "stderr text"
  assert.ok(h.text('#live-status').includes('stderr text'));
  // And no other card shows it
  assert.ok(!h.text('#dev-status').includes('stderr text'));
  assert.ok(!h.text('#test-status').includes('stderr text'));
});

// Advances the 5s timer, answers the resulting workflows poll with `active`
// and `finished` and lets the UI settle.
// The poll runs every 5 s while anything is active and every 15 s when idle,
// so advance in 5 s steps until the request appears.
const pollWorkflows = async (h, active, finished = {}) => {
  for (let i = 0; i < 3; i += 1) {
    h.tick(5000);
    await new Promise((resolve) => setImmediate(resolve));
    if (h.posted.some((m) => m.type === 'workflows' && !m._consumed)) {
      break;
    }
  }
  const msg = await h.nextRequest('workflows');
  h.consume(msg);
  h.reply(msg, { type: 'workflows', active, finished });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return msg;
};

const isBusy = (h, key) => h.$(`#card-${key}`).classList.contains('busy');

test('workflows › A deploy started elsewhere shows the test spinner', async () => {
  const h = load();
  // Given the dashboard is loaded and idle
  await boot(h, {});

  // When Pantheon reports "Deploy code to test" running on test
  const msg = await pollWorkflows(h, { test: ['Deploy code to test'] });
  assert.equal(msg.site, 'example-site');

  // Then the test card shows a spinner naming the workflow
  assert.ok(hasSpinner(h, 'test'));
  assert.ok(h.text('#test-status').includes('Deploy code to test running on test'));
  // And the test card is busy with its buttons disabled
  assert.ok(isBusy(h, 'test'));
  assert.equal(h.$('#test-deploy').disabled, true);
  // And the live card is untouched
  assert.ok(!hasSpinner(h, 'live'));
  assert.ok(!isBusy(h, 'live'));
});

test('workflows › The spinner clears on the first poll after the workflow finishes', async () => {
  const h = load();
  // Given the test card shows a spinner for a workflow started elsewhere
  await boot(h, {});
  await pollWorkflows(h, { test: ['Deploy code to test'] });
  assert.ok(hasSpinner(h, 'test'));

  // When the next poll reports no running workflows
  await pollWorkflows(h, {});

  // Then the workflow spinner is gone
  assert.ok(!h.text('#test-status').includes('Deploy code to test'));
  // And the test pending commits are requested again
  const pendingMsg = await h.nextRequest('pending');
  assert.equal(pendingMsg.env, 'test');
  h.consume(pendingMsg);
  h.reply(pendingMsg, { type: 'pending', env: 'test', commits: [] });
  await new Promise((resolve) => setImmediate(resolve));
  // And the test card is no longer busy
  assert.ok(!hasSpinner(h, 'test'));
  assert.ok(!isBusy(h, 'test'));
});

test('workflows › A running workflow on the selected multidev shows the dev spinner', async () => {
  const h = load();
  // Given the dev card targets the multidev "themes"
  await boot(h, { multidevs: ['themes'], devMode: 'git' });
  const select = h.$('#dev-env');
  select.value = 'themes';
  select.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  const devInfoMsg = await h.nextRequest('devInfo');
  h.consume(devInfoMsg);
  h.reply(devInfoMsg, { type: 'devInfo', mode: 'git' });
  const unpushedMsg = await h.nextRequest('unpushed');
  h.consume(unpushedMsg);
  h.reply(unpushedMsg, { type: 'unpushed', branch: 'themes', commits: [] });
  await new Promise((resolve) => setImmediate(resolve));

  // When Pantheon reports a workflow running on "themes"
  await pollWorkflows(h, { themes: ['Sync code on themes'] });

  // Then the dev card shows a spinner naming "themes"
  assert.ok(hasSpinner(h, 'dev'));
  assert.ok(h.text('#dev-status').includes('Sync code on themes running on themes'));
  assert.ok(isBusy(h, 'dev'));
});

test('workflows › Workflows on an env not shown on any card do not show a spinner', async () => {
  const h = load();
  // Given the dashboard is loaded and the dev card targets "dev"
  await boot(h, { multidevs: ['themes'] });

  // When Pantheon reports a workflow running on "themes"
  await pollWorkflows(h, { themes: ['Sync code on themes'] });

  // Then no card shows a spinner
  for (const key of ['dev', 'test', 'live']) {
    assert.ok(!hasSpinner(h, key));
    assert.ok(!isBusy(h, key));
  }
});

test('workflows › No poll while the panel is hidden', async () => {
  const h = load();
  // Given the dashboard is loaded
  await boot(h, {});

  // When the panel is hidden and 5 seconds pass
  h.setHidden(true);
  h.tick(5000);
  await new Promise((resolve) => setImmediate(resolve));

  // Then no workflows request is sent
  assert.equal(h.posted.filter((m) => m.type === 'workflows').length, 0);
});

test('workflows › A card running its own operation is not taken over', async () => {
  const h = load();
  // Given the test card is clearing caches
  await boot(h, {});
  h.click('[data-clear="test"]');
  await new Promise((resolve) => setImmediate(resolve));
  h.click('#test-confirm-yes');
  const clearMsg = await h.nextRequest('clearCache');
  h.consume(clearMsg);

  // When a poll reports a workflow running on test
  await pollWorkflows(h, { test: ['Clear caches on test'] });

  // Then the card keeps its own spinner text
  assert.ok(h.text('#test-status').includes('Clearing caches on test'));

  // When the operation settles
  h.reply(clearMsg, { type: 'clearCache' });
  await new Promise((resolve) => setImmediate(resolve));
  // Then the card is idle
  assert.ok(!isBusy(h, 'test'));

  // When the next poll reports no running workflows
  await pollWorkflows(h, {});
  // Then the card is still idle and shows no workflow spinner
  assert.ok(!isBusy(h, 'test'));
  assert.ok(!h.text('#test-status').includes('running on'));
});

// Unanswered requests of `type` (optionally for one env) posted since the
// harness last consumed them.
const pendingRequests = (h, type, env) =>
  h.posted.filter(
    (m) => m.type === type && !m._consumed && (!env || m.env === env)
  );

test('workflows › A workflow that starts and finishes between polls refreshes the cards', async () => {
  const h = load();
  // Given a baseline poll recorded the newest finished workflow on dev
  await boot(h, {});
  await pollWorkflows(h, {}, { dev: 'w1' });
  assert.equal(pendingRequests(h, 'pending').length, 0);

  // When the next poll reports a newer finished workflow and nothing active
  await pollWorkflows(h, {}, { dev: 'w2' });

  // Then the dev card is reloaded
  assert.equal(pendingRequests(h, 'devInfo').length, 1);
  // And the test and live pending commits are requested again
  assert.equal(pendingRequests(h, 'pending', 'test').length, 1);
  assert.equal(pendingRequests(h, 'pending', 'live').length, 1);
});

test('workflows › Workflows that ran while the panel was hidden refresh on the next visible poll', async () => {
  const h = load();
  // Given a baseline poll recorded the newest finished workflow on dev
  await boot(h, {});
  await pollWorkflows(h, {}, { dev: 'w1' });

  // When the panel is hidden and time passes
  h.setHidden(true);
  h.tick(5000);
  await new Promise((resolve) => setImmediate(resolve));
  // Then no workflows request is sent
  assert.equal(pendingRequests(h, 'workflows').length, 0);

  // When the panel is visible again and the next poll shows a new workflow
  h.setHidden(false);
  await pollWorkflows(h, {}, { dev: 'w2' });

  // Then the test and live pending commits are requested again
  assert.equal(pendingRequests(h, 'pending', 'test').length, 1);
  assert.equal(pendingRequests(h, 'pending', 'live').length, 1);
});

test('workflows › A failed workflow still refreshes the cards', async () => {
  const h = load();
  // Given a baseline poll recorded the newest finished workflow on test
  await boot(h, {});
  await pollWorkflows(h, {}, { test: 'ok1' });

  // When the next poll reports a new finished id (a failed run) on test
  await pollWorkflows(h, {}, { test: 'failed2' });

  // Then the test pending commits are requested again
  assert.equal(pendingRequests(h, 'pending', 'test').length, 1);
});

test('workflows › The first poll never refreshes', async () => {
  const h = load();
  // Given the dashboard is loaded
  await boot(h, {});

  // When the first poll reports finished workflows
  await pollWorkflows(h, {}, { dev: 'w1', test: 't1', live: 'l1' });

  // Then no card is reloaded
  assert.equal(pendingRequests(h, 'pending').length, 0);
  assert.equal(pendingRequests(h, 'devInfo').length, 0);
});

test('workflows › A watched workflow ending refreshes the card exactly once', async () => {
  const h = load();
  // Given the test spinner follows a workflow started elsewhere
  await boot(h, {});
  await pollWorkflows(h, { test: ['Deploy code to test'] }, { test: 't1' });
  assert.ok(isBusy(h, 'test'));

  // When the next poll sees it idle with a new finished id
  await pollWorkflows(h, {}, { test: 't2' });

  // Then the test pending commits are requested once
  assert.equal(pendingRequests(h, 'pending', 'test').length, 1);
});

test('workflows › A card running its own operation is not refreshed by a finished change', async () => {
  const h = load();
  // Given a baseline poll and the test card clearing caches
  await boot(h, {});
  await pollWorkflows(h, {}, { test: 't1' });
  h.click('[data-clear="test"]');
  await new Promise((resolve) => setImmediate(resolve));
  h.click('#test-confirm-yes');
  const clearMsg = await h.nextRequest('clearCache');
  h.consume(clearMsg);

  // When a poll reports a new finished id on test
  await pollWorkflows(h, {}, { test: 't2' });

  // Then the test pending commits are not requested
  assert.equal(pendingRequests(h, 'pending', 'test').length, 0);
  assert.ok(isBusy(h, 'test'));
});

// ── dashboard-workflows.feature (adaptive poll cadence) ──

const settleUi = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};
const workflowRequests = (h) => h.posted.filter((m) => m.type === 'workflows');

// Answers the next workflows request with the given active map.
const answerWorkflows = async (h, active) => {
  const msg = await h.nextRequest('workflows');
  h.consume(msg);
  h.reply(msg, { type: 'workflows', active, finished: {} });
  await settleUi();
};

test('workflows › An idle dashboard polls every 15 s, not 5 s', async () => {
  const h = load();
  await boot(h, {});
  // Given the first poll finds nothing running
  h.tick(5000);
  await answerWorkflows(h, {});
  assert.equal(workflowRequests(h).length, 1);

  // When 5 s pass
  h.tick(5000);
  await settleUi();
  // Then no further workflows request is sent
  assert.equal(workflowRequests(h).length, 1);

  // When 10 s more pass (15 s since the poll)
  h.tick(10000);
  await settleUi();
  // Then the next workflows request is sent
  assert.equal(workflowRequests(h).length, 2);
});

test('workflows › A running workflow keeps the poll at 5 s', async () => {
  const h = load();
  await boot(h, {});
  h.tick(5000);
  // Given the poll reports a workflow running on test
  await answerWorkflows(h, { test: ['Deploy code to test'] });
  assert.equal(workflowRequests(h).length, 1);

  // When 5 s pass
  h.tick(5000);
  await settleUi();
  // Then the next workflows request is sent
  assert.equal(workflowRequests(h).length, 2);
});

test('workflows › Becoming visible polls immediately', async () => {
  const h = load();
  await boot(h, {});
  h.tick(5000);
  await answerWorkflows(h, {});
  assert.equal(workflowRequests(h).length, 1);

  // When the panel becomes visible again
  h.setHidden(false);
  h.document.dispatchEvent(new h.window.Event('visibilitychange'));
  await settleUi();
  // Then a workflows request is sent without waiting
  assert.equal(workflowRequests(h).length, 2);
});
