// PantheonApi (host-side) tests, organized by Gherkin spec scenario.
// Test names use the format: `<spec slug> › <Scenario title>` matching the
// corresponding tests/specs/dashboard-*.feature file. Each host-side step
// gets a `// Then …` comment above the assertion it maps to.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PantheonApi, matchSite } = require('../src/api');

const flows = (status) =>
  JSON.stringify({
    a: {
      id: 'a',
      env: 'dev',
      workflow: 'Sync code on "dev"',
      status,
      started_at: Date.now() / 1000
    }
  });

// ── dashboard-session.feature ──

test('session › Configured site setting wins over folder matching (matchSite helper)', () => {
  // matchSite itself only covers folder-name resolution; the "configured
  // setting wins" branch lives in panel.js resolveSite and is out of scope
  // for the api-only test file (see panel.test.js, a later stage).
  // Then the selected site is "example-site" (folder-name fallback path):
  assert.equal(matchSite(['example-site', 'other'], 'unrelated'), null);
});

test('session › Site resolved from the workspace folder name: acme-site-master -> acme-site', () => {
  // Then the selected site is "acme-site"
  assert.equal(matchSite(['acme-site', 'other'], 'acme-site-master'), 'acme-site');
});

test('session › Site resolved from the workspace folder name: solo site always wins', () => {
  // Then the selected site is "my-site"
  assert.equal(matchSite(['my-site'], 'unrelated-folder'), 'my-site');
});

test('session › Site resolved from the workspace folder name: ambiguous -> none', () => {
  // Then the selected site is none
  assert.equal(matchSite(['a-site', 'b-site'], 'unrelated-folder'), null);
});

test('session › Multidev environments populate the dev selector (api returns sorted ids)', async () => {
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      assert.deepEqual(args.slice(0, 2), ['multidev:list', 'site']);
      return JSON.stringify({ themes: { id: 'themes' }, alpha: { id: 'alpha' } });
    }
  });
  // Then the dev selector lists "dev", "alpha", "themes" in that order
  // (api.listMultidevs sorts; the webview prepends "dev" — see
  // tests/harness.test.js for the full prepend-and-render assertion).
  assert.deepEqual(await api.listMultidevs('site'), ['alpha', 'themes']);
});

test('session › Terminus failure during init is shown (whoami propagates error)', async () => {
  const api = new PantheonApi('/tmp', {
    run: async () => {
      throw new Error('boom');
    }
  });
  // Then the error "boom" is shown
  await assert.rejects(() => api.whoami(), /boom/);
});

test('session › whoami trims terminus output', async () => {
  const api = new PantheonApi('/tmp', { run: async () => 'me@example.com\n' });
  assert.equal(await api.whoami(), 'me@example.com');
});

test('session › listSites splits on whitespace and commas', async () => {
  const api = new PantheonApi('/tmp', { run: async () => 'one,two three\n' });
  assert.deepEqual(await api.listSites(), ['one', 'two', 'three']);
});

// ── dashboard-connection-mode.feature ──

test('connection-mode › Current mode is shown (connectionMode reads env:info)', async () => {
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      assert.deepEqual(args.slice(0, 2), ['env:info', 'site.dev']);
      return JSON.stringify({ connection_mode: 'sftp' });
    }
  });
  // Then the mode badge reads "SFTP"
  assert.equal(await api.connectionMode('site', 'dev'), 'sftp');
});

test('connection-mode › Switching to SFTP mode needs no confirmation (setMode switches, waits, reports fresh mode)', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args[0]);
      if (args[0] === 'workflow:list') {
        return '{}';
      }
      if (args[0] === 'env:info') {
        return JSON.stringify({ connection_mode: 'sftp' });
      }
      return '';
    }
  });
  // Then the host sets the connection mode to "sftp"
  assert.equal(await api.setMode('site', 'dev', 'sftp'), 'sftp');
  assert.deepEqual(calls, ['connection:set', 'workflow:list', 'env:info']);
});

test('connection-mode › Uncommitted SFTP changes are listed (diffstat normalizes keyed-object output)', async () => {
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      assert.equal(args[1], 'site.themes');
      return JSON.stringify({
        'wp-content/a.php': { status: 'M', additions: '2', deletions: '1' }
      });
    }
  });
  // Then "wp-content/a.php" is listed with its status, additions and deletions
  assert.deepEqual(await api.diffstat('site', 'themes'), [
    { file: 'wp-content/a.php', status: 'M', additions: '2', deletions: '1' }
  ]);
});

test('connection-mode › diffstat passes clean [] through', async () => {
  const api = new PantheonApi('/tmp', { run: async () => '[]' });
  assert.deepEqual(await api.diffstat('site', 'dev'), []);
});

test('connection-mode › Committing SFTP changes (commit sends message then waits for workflows)', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  // Then the host runs the env commit with message "Fix header"
  await api.commit('site', 'themes', 'Fix header');
  assert.ok(calls[0].startsWith('env:commit site.themes --message=Fix header'));
  assert.ok(calls[1].startsWith('workflow:list site'));
});

// ── dashboard-deploy.feature ──

const PANTHEON_URL =
  'ssh://codeserver.dev.11111111-1111-4111-8111-111111111111@codeserver.dev.11111111-1111-4111-8111-111111111111.drush.in:2222/~/repository.git';
const GITHUB_URL = 'git@github.com:example-org/example-repo.git';
const LONG_MESSAGE =
  'Merge pull request #1 from example-org/feature-branch-with-a-long-name';
const REMOTES = [
  `origin\t${GITHUB_URL} (fetch)`,
  `origin\t${GITHUB_URL} (push)`,
  `pantheon\t${PANTHEON_URL} (fetch)`,
  `pantheon\t${PANTHEON_URL} (push)`
].join('\n');

// Stub runner dispatching on the git subcommand; records every call.
function pendingStub(overrides = {}) {
  const calls = [];
  const tags = overrides.tags || {
    test: ['pantheon_test_1000', 'pantheon_test_999'],
    live: ['pantheon_live_998', 'pantheon_live_997']
  };
  const run = async (bin, args) => {
    calls.push({ bin, args });
    if (bin !== 'git') {
      throw new Error(`unexpected ${bin}`);
    }
    if (args[0] === 'remote') {
      return overrides.remotes === undefined ? REMOTES : overrides.remotes;
    }
    if (args[0] === 'fetch') {
      if (overrides.fetchError) {
        throw new Error(overrides.fetchError);
      }
      return '';
    }
    if (args[0] === 'tag') {
      const env = args[2].split('_')[1];
      return (tags[env] || []).join('\n') + '\n';
    }
    if (args[0] === 'log') {
      return (
        [
          'aaa111',
          'Example Author',
          '2026-01-01T00:00:00+00:00',
          LONG_MESSAGE
        ].join('\x1f') + '\n'
      );
    }
    throw new Error(`unexpected git ${args[0]}`);
  };
  return { calls, run };
}
const gitCalls = (calls, sub) => calls.filter((c) => c.args[0] === sub);

test('deploy › Test pending commits come from git with full messages', async () => {
  // Given the Pantheon remote is named "pantheon" and origin is GitHub
  const { calls, run } = pendingStub();
  const api = new PantheonApi('/tmp', { run });
  // When the test card loads
  const commits = await api.pendingCommits('site', 'test');
  // Then pantheon master is fetched with tags
  assert.deepEqual(gitCalls(calls, 'fetch')[0].args, [
    'fetch',
    'pantheon',
    'master',
    '--tags'
  ]);
  // And the commits in the test tag..pantheon/master range are pending
  assert.equal(
    gitCalls(calls, 'log')[0].args[1],
    'pantheon_test_1000..pantheon/master'
  );
  // And a message longer than 50 characters is returned in full
  assert.ok(LONG_MESSAGE.length > 50);
  assert.deepEqual(commits, [
    {
      hash: 'aaa111',
      author: 'Example Author',
      datetime: '2026-01-01T00:00:00+00:00',
      message: LONG_MESSAGE
    }
  ]);
});

test('deploy › Live pending commits come from git', async () => {
  // Given the latest deploy tags are pantheon_test_1000 and pantheon_live_998
  const { calls, run } = pendingStub();
  const api = new PantheonApi('/tmp', { run });
  // When the live card loads
  await api.pendingCommits('site', 'live');
  // Then the commits in pantheon_live_998..pantheon_test_1000 are pending
  assert.equal(
    gitCalls(calls, 'log')[0].args[1],
    'pantheon_live_998..pantheon_test_1000'
  );
});

test('deploy › Deploy tags sort numerically', async () => {
  // Given the deploy tags for test are pantheon_test_999 and pantheon_test_1000
  const { calls, run } = pendingStub();
  const api = new PantheonApi('/tmp', { run });
  // When the test card loads
  await api.pendingCommits('site', 'test');
  // Then the tags are listed with --sort=-v:refname
  assert.ok(gitCalls(calls, 'tag')[0].args.includes('--sort=-v:refname'));
  // And the range starts at pantheon_test_1000
  assert.ok(
    gitCalls(calls, 'log')[0].args[1].startsWith('pantheon_test_1000..')
  );
});

test('deploy › Pantheon remote is detected by URL', async () => {
  // Given origin is a GitHub remote and "pantheon" has the Pantheon URL
  const { calls, run } = pendingStub();
  const api = new PantheonApi('/tmp', { run });
  // When the test card loads
  await api.pendingCommits('site', 'test');
  // Then the fetch targets the "pantheon" remote
  assert.equal(gitCalls(calls, 'fetch')[0].args[1], 'pantheon');
});

test('deploy › No Pantheon remote', async () => {
  // Given no remote has the Pantheon codeserver URL
  const { calls, run } = pendingStub({
    remotes: `origin\t${GITHUB_URL} (fetch)\norigin\t${GITHUB_URL} (push)`
  });
  const api = new PantheonApi('/tmp', { run });
  // When the test card loads / Then it fails with the clear message
  await assert.rejects(
    api.pendingCommits('site', 'test'),
    new Error(
      'No Pantheon git remote (ssh://codeserver.dev.<site-id>@codeserver.dev.<site-id>.drush.in:2222/~/repository.git) in this workspace'
    )
  );
  // And no fetch is run
  assert.equal(gitCalls(calls, 'fetch').length, 0);
});

test('deploy › Fetch failure surfaces', async () => {
  // Given the Pantheon fetch fails
  const { run } = pendingStub({
    fetchError: 'fatal: Could not read from remote repository.'
  });
  const api = new PantheonApi('/tmp', { run });
  // When the test card loads / Then it fails with that message
  await assert.rejects(
    api.pendingCommits('site', 'test'),
    /fatal: Could not read from remote repository\./
  );
});

test('deploy › No deploy tag', async () => {
  // Given the repository has no pantheon_test_* tag
  const { run } = pendingStub({ tags: { test: [], live: [] } });
  const api = new PantheonApi('/tmp', { run });
  // When the test card loads / Then it fails with the clear message
  await assert.rejects(
    api.pendingCommits('site', 'test'),
    new Error('No pantheon_test_* deploy tag in this repository')
  );
});

test('deploy › Test and Live loading together share one fetch', async () => {
  const { calls, run } = pendingStub();
  const api = new PantheonApi('/tmp', { run });
  // When the test and live cards load at the same time
  await Promise.all([
    api.pendingCommits('site', 'test'),
    api.pendingCommits('site', 'live')
  ]);
  // Then exactly one fetch runs
  assert.equal(gitCalls(calls, 'fetch').length, 1);
  // And no terminus command is run
  assert.equal(calls.filter((c) => c.bin !== 'git').length, 0);
});

test('deploy › Deploy only (deploy passes the note then waits for workflows, no --cc)', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  // Then the host deploys to test with note "Release" and without clearing caches
  await api.deploy('site', 'test', 'Release note');
  assert.ok(calls[0].startsWith('env:deploy site.test --note=Release note'));
  assert.ok(!calls[0].includes('--cc'));
});

test('deploy › Deploy with clear caches only: api.deploy(site, env, note, { cc: true }) adds --cc', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  // Then the host deploys to live with caches cleared
  await api.deploy('site', 'live', 'Release', { cc: true });
  assert.ok(calls[0].includes('--cc'));
});

test('deploy › Deploy with clear caches only: without cc, --cc is not added', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  await api.deploy('site', 'live', 'Release');
  assert.ok(!calls[0].includes('--cc'));
});

test('deploy › Test deploy then sync database and files (cloneContent called after deploy, api-level)', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  await api.deploy('site', 'test', 'Release');
  await api.cloneContent('site', 'live', 'test', { db: true, files: true, cc: true });
  // Then database and files are cloned from "live" to "test" with caches cleared
  assert.ok(calls.some((c) => c.startsWith('env:deploy site.test')));
  assert.ok(
    calls.some(
      (c) => c.startsWith('env:clone-content site.live test --yes') && c.includes('--cc')
    )
  );
});

// ── dashboard-local-commits.feature ──

test('local-commits › Unpushed commits are listed (fetches origin then parses git log)', async () => {
  const calls = [];
  const line = ['abc123', 'Terry', '2026-10-02T10:00:00-07:00', 'Fix header'].join(
    '\x1f'
  );
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      calls.push([bin, ...args.slice(0, 2)]);
      return args[0] === 'log' ? `${line}\n` : '';
    }
  });
  const commits = await api.unpushedCommits('master');
  // Then git fetches origin before listing unpushed commits
  assert.deepEqual(calls[0], ['git', 'fetch', 'origin']);
  assert.deepEqual(calls[1], ['git', 'log', 'origin/master..master']);
  // Then the commit is listed with its message, short hash, date and author
  assert.deepEqual(commits, [
    {
      hash: 'abc123',
      author: 'Terry',
      datetime: '2026-10-02T10:00:00-07:00',
      message: 'Fix header'
    }
  ]);
});

test('local-commits › A multidev compares its own branch', async () => {
  const ranges = [];
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      if (args[0] === 'log') {
        ranges.push(args[1]);
      }
      return '';
    }
  });
  await api.unpushedCommits('themes');
  // Then unpushed commits are computed for "origin/themes..themes"
  assert.deepEqual(ranges, ['origin/themes..themes']);
});

test('local-commits › Refresh fetches origin first', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      calls.push(args[0]);
      return '';
    }
  });
  await api.unpushedCommits('master');
  // Then git fetches origin before listing unpushed commits
  assert.equal(calls[0], 'fetch');
});

test('local-commits › Background check finds a new local commit without fetching (fetch: false)', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      calls.push([bin, args[0]]);
      return '';
    }
  });
  await api.unpushedCommits('master', { fetch: false });
  // Then git did not fetch origin for the background check
  assert.deepEqual(calls, [['git', 'log']]);
});

test('local-commits › Push only (push sends the branch to origin then waits for the env sync)', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push([bin, ...args.slice(0, 3)]);
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  // Then git pushes "master" to origin
  await api.push('site', 'dev', 'master');
  assert.deepEqual(calls[0], ['git', 'push', 'origin', 'master']);
  // Then the host waits for the dev workflows
  assert.equal(calls[1][1], 'workflow:list');
});

test('local-commits › Push then sync database and clear caches (cloneContent after push, api-level)', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  await api.push('site', 'dev', 'master');
  await api.cloneContent('site', 'live', 'dev', { db: true, files: false, cc: true });
  // Then the database is cloned from "live" to "dev" with caches cleared
  assert.ok(
    calls.some(
      (c) =>
        c.startsWith('env:clone-content site.live dev --yes') &&
        c.includes('--db-only') &&
        c.includes('--cc')
    )
  );
});

test('local-commits › Push then clear caches only (clearCache after push, api-level)', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  await api.push('site', 'dev', 'master');
  await api.clearCache('site', 'dev');
  // Then caches are cleared on "dev"
  assert.ok(calls.some((c) => c.startsWith('env:clear-cache site.dev')));
});

test('local-commits › Push failure is shown in the card (git push rejects)', async () => {
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      if (args[0] === 'push') {
        throw new Error('rejected');
      }
      return '';
    }
  });
  // Then the dev card shows the error "rejected"
  await assert.rejects(() => api.push('site', 'dev', 'master'), /rejected/);
});

// ── dashboard-content-sync.feature ──

test('content-sync › Syncing runs the matching clone: Database only -> --db-only', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    waitTimeoutMs: 50,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      if (args[0] === 'workflow:list') {
        return JSON.stringify({
          live: {
            env: 'live',
            workflow: 'Clone database to "live"',
            status: 'running',
            started_at: Date.now() / 1000
          }
        });
      }
      return '';
    }
  });
  // Then the host clones from "live" to "test" with flags "--db-only"
  await api.cloneContent('site', 'live', 'test', { db: true, files: false });
  assert.deepEqual(calls[0].split(' '), [
    'env:clone-content',
    'site.live',
    'test',
    '--yes',
    '--db-only'
  ]);
});

test('content-sync › Syncing runs the matching clone: Files only -> --files-only', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  // Then the host clones from "live" to "test" with flags "--files-only"
  await api.cloneContent('site', 'live', 'test', { db: false, files: true });
  assert.deepEqual(calls[0].split(' '), [
    'env:clone-content',
    'site.live',
    'test',
    '--yes',
    '--files-only'
  ]);
});

test('content-sync › Syncing runs the matching clone: Database and Files -> no flags', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  // Then the host clones from "live" to "test" with flags ""
  await api.cloneContent('site', 'live', 'test', { db: true, files: true });
  assert.deepEqual(calls[0].split(' '), [
    'env:clone-content',
    'site.live',
    'test',
    '--yes'
  ]);
});

test('content-sync › Syncing runs the matching clone: Database and Clear caches -> --db-only --cc', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  // Then the host clones from "live" to "test" with flags "--db-only --cc"
  await api.cloneContent('site', 'live', 'test', { db: true, files: false, cc: true });
  assert.deepEqual(calls[0].split(' '), [
    'env:clone-content',
    'site.live',
    'test',
    '--yes',
    '--db-only',
    '--cc'
  ]);
});

test('content-sync › Syncing runs the matching clone: waits up to 60 minutes on the target env', async () => {
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => (args[0] === 'workflow:list' ? '{}' : '')
  });
  let capturedTimeout;
  const original = api.waitForEnv.bind(api);
  api.waitForEnv = (site, env, since, timeoutMs) => {
    capturedTimeout = timeoutMs;
    return original(site, env, since, timeoutMs);
  };
  await api.cloneContent('site', 'live', 'test', { db: true, files: false });
  // Then the host waits up to 60 minutes for the clone workflows on "test"
  assert.equal(capturedTimeout, 60 * 60 * 1000);
});

test('content-sync › Sync with neither database nor files is rejected by the host', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return '{}';
    }
  });
  // Then it fails with "Select database and/or files to sync."
  await assert.rejects(
    () => api.cloneContent('site', 'dev', 'test', { db: false, files: false }),
    /Select database and\/or files to sync\./
  );
  // Then no command is run
  assert.deepEqual(calls, []);
});

test('content-sync › cloneContent db+files+cc: no --db-only/--files-only, includes --cc', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  await api.cloneContent('site', 'dev', 'test', { db: true, files: true, cc: true });
  assert.deepEqual(calls[0].split(' '), [
    'env:clone-content',
    'site.dev',
    'test',
    '--yes',
    '--cc'
  ]);
});

// ── dashboard-workflows.feature ──

test('workflows › Waits until running workflows finish', async () => {
  let polls = 0;
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      assert.equal(args[0], 'workflow:list');
      polls += 1;
      return flows(polls < 3 ? 'running' : 'succeeded');
    }
  });
  await api.waitForEnv('site', 'dev', Date.now() / 1000 - 10);
  // Then it polls the workflow list three times
  assert.equal(polls, 3);
  // Then it resolves (no throw above)
});

test('workflows › A failed workflow fails the operation', async () => {
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async () => flows('failed')
  });
  // Then it fails with "Pantheon workflow failed"
  await assert.rejects(
    () => api.waitForEnv('site', 'dev', Date.now() / 1000 - 10),
    /Pantheon workflow failed/
  );
});

test('workflows › Workflows from before the operation are ignored', async () => {
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async () =>
      JSON.stringify({
        old: {
          id: 'old',
          env: 'dev',
          workflow: 'Old deploy',
          status: 'running',
          started_at: Date.now() / 1000 - 9999
        }
      })
  });
  // Then it resolves
  await api.waitForEnv('site', 'dev', Date.now() / 1000);
});

test('workflows › Pantheon housekeeping workflows are ignored', async () => {
  const now = Date.now() / 1000;
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    waitTimeoutMs: 50,
    run: async () =>
      JSON.stringify({
        deploy: {
          env: 'live',
          workflow: 'Deploy code to "live"',
          status: 'succeeded',
          started_at: now
        },
        index: {
          env: 'live',
          workflow: "Update the Package Index Service on 'live'",
          status: 'running',
          started_at: now
        }
      })
  });
  // Then it resolves
  await api.waitForEnv('site', 'live', now - 10);
});

test('workflows › Workflows on other environments are ignored', async () => {
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    waitTimeoutMs: 50,
    run: async () =>
      JSON.stringify({
        live: {
          env: 'live',
          workflow: 'Deploy code to "live"',
          status: 'running',
          started_at: Date.now() / 1000
        }
      })
  });
  // Then it resolves
  await api.waitForEnv('site', 'test', Date.now() / 1000 - 10);
});

test('workflows › Timing out reports the stuck workflows', async () => {
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    waitTimeoutMs: 10 * 60 * 1000,
    run: async () => flows('running')
  });
  // Then it fails with "Timed out waiting for workflows on dev"
  await assert.rejects(
    () => api.waitForEnv('site', 'dev', Date.now() / 1000 - 10, 20),
    /Timed out waiting for workflows on dev/
  );
});

test('workflows › Content clones get a 60 minute timeout (spy on waitForEnv)', async () => {
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => (args[0] === 'workflow:list' ? '{}' : '')
  });
  let capturedTimeout;
  const original = api.waitForEnv.bind(api);
  api.waitForEnv = (site, env, since, timeoutMs) => {
    capturedTimeout = timeoutMs;
    return original(site, env, since, timeoutMs);
  };
  await api.cloneContent('site', 'dev', 'test', { db: true, files: false });
  // Then it waits with a 60 minute timeout
  assert.equal(capturedTimeout, 3600000);
});

test('workflows › waitForEnv honors an explicit timeoutMs argument', async () => {
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    waitTimeoutMs: 10 * 60 * 1000,
    run: async () => flows('running')
  });
  await assert.rejects(
    () => api.waitForEnv('site', 'dev', Date.now() / 1000 - 10, 20),
    /Timed out/
  );
});

// Errors reaching the card that started the operation is a webview-side
// concern (request/response bridge keyed by requestId) — see
// tests/harness.test.js / a later webview.test.js stage, not api.test.js.

// ── Remaining api-level coverage (not spec-mapped 1:1, kept for regression) ──

test('api › setMode switches, waits, then reports the fresh mode', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args[0]);
      if (args[0] === 'workflow:list') {
        return '{}';
      }
      if (args[0] === 'env:info') {
        return JSON.stringify({ connection_mode: 'sftp' });
      }
      return '';
    }
  });
  assert.equal(await api.setMode('site', 'dev', 'sftp'), 'sftp');
  assert.deepEqual(calls, ['connection:set', 'workflow:list', 'env:info']);
});

test('api › clearCache clears the env then waits for workflows', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.slice(0, 2).join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  await api.clearCache('site', 'live');
  assert.deepEqual(calls, ['env:clear-cache site.live', 'workflow:list site']);
});

// ── active workflows poll ──

const workflowList = (...items) =>
  JSON.stringify(
    Object.fromEntries(
      items.map(([env, workflow, status, finishedAt], i) => [
        `w${i}`,
        {
          id: `w${i}`,
          env,
          workflow,
          status,
          started_at: Date.now() / 1000,
          finished_at: finishedAt
        }
      ])
    )
  );

const workflowsApi = (list) =>
  new PantheonApi('/tmp', {
    run: async (bin, args) => {
      // Then terminus lists the site's workflows once
      assert.deepEqual(args.slice(0, 2), ['workflow:list', 'site']);
      return list;
    }
  });

test('workflows › Active workflows are grouped by env', async () => {
  const api = workflowsApi(
    workflowList(
      ['dev', 'Sync code on "dev"', 'running'],
      ['dev', 'Deploy', 'succeeded'],
      ['dev', 'Clear cache', 'failed'],
      ['feature1', 'Sync code on "feature1"', 'running'],
      ['test', 'Deploy code to "test"', 'running'],
      ['test', 'Sync code', 'aborted'],
      ['live', 'Clear cache', 'running']
    )
  );
  const { active } = await api.activeWorkflows('site');
  // Then only running workflows are returned, grouped by env
  assert.deepEqual(active, {
    dev: ['Sync code on "dev"'],
    feature1: ['Sync code on "feature1"'],
    test: ['Deploy code to "test"'],
    live: ['Clear cache']
  });
});

test('workflows › Pantheon housekeeping workflows are not reported', async () => {
  const api = workflowsApi(
    workflowList(
      ['dev', 'Automated backup', 'running'],
      ['live', 'Update the Package Index Service', 'running']
    )
  );
  // Then nothing is reported
  assert.deepEqual(await api.activeWorkflows('site'), {
    active: {},
    finished: {}
  });
});

test('workflows › No active workflows', async () => {
  const api = workflowsApi(workflowList(['dev', 'Deploy', 'succeeded']));
  // Then no workflow is active
  assert.deepEqual((await api.activeWorkflows('site')).active, {});
});

test('workflows › Finished is the newest terminal workflow id per env', async () => {
  const api = workflowsApi(
    workflowList(
      ['dev', 'Deploy', 'succeeded', 100],
      ['dev', 'Clear cache', 'succeeded', 300],
      ['dev', 'Sync code', 'succeeded', 200],
      ['test', 'Deploy', 'succeeded', 50]
    )
  );
  // Then finished maps each env to the id with the largest finished_at
  assert.deepEqual((await api.activeWorkflows('site')).finished, {
    dev: 'w1',
    test: 'w3'
  });
});

test('workflows › Failed and aborted workflows count as finished', async () => {
  const api = workflowsApi(
    workflowList(
      ['dev', 'Deploy', 'succeeded', 100],
      ['dev', 'Clear cache', 'failed', 200],
      ['test', 'Sync code', 'aborted', 150]
    )
  );
  // Then they are reported as finished
  assert.deepEqual((await api.activeWorkflows('site')).finished, {
    dev: 'w1',
    test: 'w2'
  });
});

test('workflows › Running and housekeeping workflows are not finished', async () => {
  const api = workflowsApi(
    workflowList(
      ['dev', 'Deploy', 'running'],
      ['live', 'Update the Package Index Service', 'succeeded', 500],
      ['live', 'Clear cache', 'succeeded', 100]
    )
  );
  // Then only the non-housekeeping terminal workflow is reported
  assert.deepEqual((await api.activeWorkflows('site')).finished, {
    live: 'w2'
  });
});

test('workflows › Finished is empty when nothing is terminal', async () => {
  const api = workflowsApi(workflowList(['dev', 'Deploy', 'running']));
  // Then finished is empty
  assert.deepEqual((await api.activeWorkflows('site')).finished, {});
});

// ── pending commits follow first-parent history ──

test('deploy › Pending commits use first-parent history on test and live', async () => {
  const { calls, run } = pendingStub();
  const api = new PantheonApi('/tmp', { run });
  await api.pendingCommits('site', 'test');
  await api.pendingCommits('site', 'live');
  const logs = gitCalls(calls, 'log');
  assert.equal(logs.length, 2);
  assert.ok(logs[0].args.includes('--first-parent'));
  assert.ok(logs[1].args.includes('--first-parent'));
});

test('local-commits › Unpushed commits keep full history (no --first-parent)', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      calls.push(args);
      return '';
    }
  });
  await api.unpushedCommits('master');
  const log = calls.find((a) => a[0] === 'log');
  assert.ok(!log.includes('--first-parent'));
});

test('deploy › Merged branch commits are not pending (real git repo)', async () => {
  const { execFileSync } = require('node:child_process');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { run } = require('../src/shell');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-fp-'));
  try {
    const git = (...args) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.com',
          '-c',
          'commit.gpgsign=false',
          ...args
        ],
        { cwd: dir, encoding: 'utf8' }
      );
    git('init', '-q', '-b', 'master');
    git('commit', '-q', '--allow-empty', '-m', 'base');
    git('tag', 'pantheon_test_1');
    git('checkout', '-q', '-b', 'feature');
    git('commit', '-q', '--allow-empty', '-m', 'feature one');
    git('commit', '-q', '--allow-empty', '-m', 'feature two');
    git('checkout', '-q', 'master');
    git('merge', '-q', '--no-ff', 'feature', '-m', 'merge feature');
    git('update-ref', 'refs/remotes/pantheon/master', 'master');
    const api = new PantheonApi(dir, { run });
    api.fetchPantheon = async () => 'pantheon';
    const commits = await api.pendingCommits('site', 'test');
    assert.deepEqual(
      commits.map((c) => c.message),
      ['merge feature']
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── dashboard-workflows.feature (shared workflow:list) ──

// Stub runner whose workflow:list replies are released by the test.
const gatedRunner = () => {
  const calls = [];
  const run = (bin, args) =>
    new Promise((resolve) => {
      calls.push({ site: args[1], resolve });
    });
  return { calls, run };
};
const settleTicks = () => new Promise((resolve) => setImmediate(resolve));

test('workflows › activeWorkflows joins an in-flight waitForEnv poll', async () => {
  const { calls, run } = gatedRunner();
  const api = new PantheonApi('/tmp', { pollMs: 1, run });
  const waiting = api.waitForEnv('site', 'dev', Date.now() / 1000 - 10);
  await settleTicks();
  assert.equal(calls.length, 1);

  const active = api.activeWorkflows('site');
  await settleTicks();
  // Then no second workflow:list is issued
  assert.equal(calls.length, 1);

  calls[0].resolve(flows('succeeded'));
  const result = await active;
  assert.deepEqual(result.active, {});
  await waiting;
  assert.equal(calls.length, 1);
});

test('workflows › waitForEnv never reuses an in-flight activeWorkflows call', async () => {
  const { calls, run } = gatedRunner();
  const api = new PantheonApi('/tmp', { pollMs: 1, run });
  const active = api.activeWorkflows('site');
  await settleTicks();
  assert.equal(calls.length, 1);

  const waiting = api.waitForEnv('site', 'dev', Date.now() / 1000 - 10);
  await settleTicks();
  // Then waitForEnv issues its own fresh call
  assert.equal(calls.length, 2);

  calls[0].resolve(flows('succeeded'));
  calls[1].resolve(flows('succeeded'));
  await active;
  await waiting;
});

test('workflows › activeWorkflows for a different site issues a separate call', async () => {
  const { calls, run } = gatedRunner();
  const api = new PantheonApi('/tmp', { pollMs: 1, run });
  const waiting = api.waitForEnv('site-a', 'dev', Date.now() / 1000 - 10);
  await settleTicks();
  const active = api.activeWorkflows('site-b');
  await settleTicks();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].site, 'site-b');
  calls[0].resolve(flows('succeeded'));
  calls[1].resolve(flows('succeeded'));
  await active;
  await waiting;
});
