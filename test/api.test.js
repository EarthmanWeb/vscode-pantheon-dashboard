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

test('matchSite matches folder-name overlap, solo site, else null', () => {
  assert.equal(matchSite(['acme-site', 'other'], 'acme-site-master'), 'acme-site');
  assert.equal(matchSite(['my-site'], 'unrelated-folder'), 'my-site');
  assert.equal(matchSite(['a-site', 'b-site'], 'unrelated-folder'), null);
});

test('whoami trims terminus output', async () => {
  const api = new PantheonApi('/tmp', { run: async () => 'me@example.com\n' });
  assert.equal(await api.whoami(), 'me@example.com');
});

test('listSites splits on whitespace and commas', async () => {
  const api = new PantheonApi('/tmp', { run: async () => 'one,two three\n' });
  assert.deepEqual(await api.listSites(), ['one', 'two', 'three']);
});

test('listMultidevs returns sorted env ids', async () => {
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      assert.deepEqual(args.slice(0, 2), ['multidev:list', 'site']);
      return JSON.stringify({ themes: { id: 'themes' }, alpha: { id: 'alpha' } });
    }
  });
  assert.deepEqual(await api.listMultidevs('site'), ['alpha', 'themes']);
});

test('diffstat normalizes keyed-object output', async () => {
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      assert.equal(args[1], 'site.themes');
      return JSON.stringify({
        'wp-content/a.php': { status: 'M', additions: '2', deletions: '1' }
      });
    }
  });
  assert.deepEqual(await api.diffstat('site', 'themes'), [
    { file: 'wp-content/a.php', status: 'M', additions: '2', deletions: '1' }
  ]);
});

test('diffstat passes clean [] through', async () => {
  const api = new PantheonApi('/tmp', { run: async () => '[]' });
  assert.deepEqual(await api.diffstat('site', 'dev'), []);
});

test('pendingCommits for test = commits on dev not yet on test', async () => {
  const log = JSON.stringify([
    { hash: '1', labels: 'dev', message: 'pending' },
    { hash: '2', labels: 'test, live, dev', message: 'deployed' }
  ]);
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      assert.deepEqual(args.slice(0, 2), ['env:code-log', 'site.dev']);
      return log;
    }
  });
  const commits = await api.pendingCommits('site', 'test');
  assert.deepEqual(
    commits.map((c) => c.hash),
    ['1']
  );
});

test('pendingCommits for live reads the test code log', async () => {
  const log = JSON.stringify([
    { hash: '1', labels: 'test, dev', message: 'pending live' },
    { hash: '2', labels: 'test, live, dev', message: 'deployed' }
  ]);
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      assert.equal(args[1], 'site.test');
      return log;
    }
  });
  const commits = await api.pendingCommits('site', 'live');
  assert.deepEqual(
    commits.map((c) => c.hash),
    ['1']
  );
});

test('unpushedCommits fetches origin then parses git log', async () => {
  const calls = [];
  const line = [
    'abc123',
    'Terry',
    '2026-10-02T10:00:00-07:00',
    'Fix header'
  ].join('\x1f');
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      calls.push([bin, ...args.slice(0, 2)]);
      return args[0] === 'log' ? `${line}\n` : '';
    }
  });
  const commits = await api.unpushedCommits('master');
  assert.deepEqual(calls[0], ['git', 'fetch', 'origin']);
  assert.deepEqual(calls[1], ['git', 'log', 'origin/master..master']);
  assert.deepEqual(commits, [
    {
      hash: 'abc123',
      author: 'Terry',
      datetime: '2026-10-02T10:00:00-07:00',
      message: 'Fix header'
    }
  ]);
});

test('unpushedCommits compares a multidev branch against its origin', async () => {
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
  assert.deepEqual(ranges, ['origin/themes..themes']);
});

test('waitForEnv polls until the workflow is terminal', async () => {
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
  assert.equal(polls, 3);
});

test('waitForEnv throws when the workflow failed', async () => {
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async () => flows('failed')
  });
  await assert.rejects(
    () => api.waitForEnv('site', 'dev', Date.now() / 1000 - 10),
    /workflow failed/
  );
});

test('waitForEnv ignores workflows from before the operation', async () => {
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
  await api.waitForEnv('site', 'dev', Date.now() / 1000);
});

test('waitForEnv ignores Pantheon background housekeeping workflows', async () => {
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
  await api.waitForEnv('site', 'live', now - 10);
});

test('cloneContent db only: clones with --db-only then waits on the target env', async () => {
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
  await api.cloneContent('site', 'live', 'test', { db: true, files: false });
  assert.deepEqual(calls[0].split(' '), [
    'env:clone-content',
    'site.live',
    'test',
    '--yes',
    '--db-only'
  ]);
});

test('cloneContent db+files+cc: no --db-only/--files-only, includes --cc', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  await api.cloneContent('site', 'dev', 'test', {
    db: true,
    files: true,
    cc: true
  });
  assert.deepEqual(calls[0].split(' '), [
    'env:clone-content',
    'site.dev',
    'test',
    '--yes',
    '--cc'
  ]);
});

test('cloneContent files only: includes --files-only, not --db-only', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  await api.cloneContent('site', 'dev', 'test', { db: false, files: true });
  assert.deepEqual(calls[0].split(' '), [
    'env:clone-content',
    'site.dev',
    'test',
    '--yes',
    '--files-only'
  ]);
});

test('cloneContent with neither db nor files rejects and runs no commands', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return '{}';
    }
  });
  await assert.rejects(
    () => api.cloneContent('site', 'dev', 'test', { db: false, files: false }),
    /database and\/or files/
  );
  assert.deepEqual(calls, []);
});

test('unpushedCommits with fetch: false skips git fetch and only logs', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    run: async (bin, args) => {
      calls.push([bin, args[0]]);
      return '';
    }
  });
  await api.unpushedCommits('master', { fetch: false });
  assert.deepEqual(calls, [['git', 'log']]);
});

test('waitForEnv honors an explicit timeoutMs argument', async () => {
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

test('commit sends the message then waits for workflows', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  await api.commit('site', 'themes', 'Fix header');
  assert.ok(calls[0].startsWith('env:commit site.themes --message=Fix header'));
  assert.ok(calls[1].startsWith('workflow:list site'));
});

test('deploy passes the note then waits for workflows', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push(args.join(' '));
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  await api.deploy('site', 'test', 'Release note');
  assert.ok(calls[0].startsWith('env:deploy site.test --note=Release note'));
});

test('push sends the branch to origin then waits for the env sync', async () => {
  const calls = [];
  const api = new PantheonApi('/tmp', {
    pollMs: 1,
    run: async (bin, args) => {
      calls.push([bin, ...args.slice(0, 3)]);
      return args[0] === 'workflow:list' ? '{}' : '';
    }
  });
  await api.push('site', 'dev', 'master');
  assert.deepEqual(calls[0], ['git', 'push', 'origin', 'master']);
  assert.equal(calls[1][1], 'workflow:list');
});

test('clearCache clears the env then waits for workflows', async () => {
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

test('setMode switches, waits, then reports the fresh mode', async () => {
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
