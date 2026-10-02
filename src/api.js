const { run } = require('./shell');

// Workflow statuses Pantheon reports as finished.
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'aborted']);
const POLL_MS = 4000;
const WAIT_TIMEOUT_MS = 10 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Pick the site whose name overlaps the workspace folder name (pattern from
// mcp-wp-cli-terminus configure.py _detect_terminus_site). Null = ambiguous;
// the UI offers the site switcher instead.
const matchSite = (sites, hint) => {
  const lower = hint.toLowerCase();
  const match = sites.find(
    (s) => lower.includes(s.toLowerCase()) || s.toLowerCase().includes(lower)
  );
  if (match) {
    return match;
  }
  return sites.length === 1 ? sites[0] : null;
};

// API layer between the webview message router and the terminus/git CLIs.
// Every mutating operation records its start time, runs the command, then
// polls the environment's workflow queue until every workflow started since
// then reaches a terminal status — so callers (and the webview spinners)
// only settle once Pantheon has fully completed the work.
class PantheonApi {
  constructor(cwd, options = {}) {
    this.cwd = cwd;
    this.run = options.run || run;
    this.pollMs = options.pollMs || POLL_MS;
    this.waitTimeoutMs = options.waitTimeoutMs || WAIT_TIMEOUT_MS;
  }

  terminus(args) {
    return this.run('terminus', args, this.cwd);
  }

  async terminusJson(args) {
    return JSON.parse(await this.terminus([...args, '--format=json']));
  }

  git(args) {
    return this.run('git', args, this.cwd);
  }

  async whoami() {
    return (await this.terminus(['auth:whoami'])).trim();
  }

  async listSites() {
    const out = await this.terminus([
      'site:list',
      '--field=name',
      '--format=string'
    ]);
    return out.split(/[\s,]+/).filter(Boolean);
  }

  // Multidev environment ids (behave like dev: sftp/git, commit, diffstat).
  async listMultidevs(site) {
    const envs = await this.terminusJson(['multidev:list', site]);
    return Object.keys(envs).sort();
  }

  async connectionMode(site, env) {
    const info = await this.terminusJson(['env:info', `${site}.${env}`]);
    return info.connection_mode;
  }

  async setMode(site, env, mode) {
    const since = Date.now() / 1000;
    await this.terminus(['connection:set', `${site}.${env}`, mode, '--yes']);
    await this.waitForEnv(site, env, since);
    return this.connectionMode(site, env);
  }

  // Uncommitted changes on the env's server (SFTP mode). Terminus returns []
  // when clean and an object keyed by file path when dirty — normalize.
  async diffstat(site, env) {
    const stat = await this.terminusJson(['env:diffstat', `${site}.${env}`]);
    if (Array.isArray(stat)) {
      return stat;
    }
    return Object.entries(stat).map(([file, row]) => ({ file, ...row }));
  }

  async commit(site, env, message) {
    const since = Date.now() / 1000;
    await this.terminus([
      'env:commit',
      `${site}.${env}`,
      `--message=${message}`
    ]);
    await this.waitForEnv(site, env, since);
  }

  // Local commits on `branch` not pushed to origin/<branch>. Pantheon's dev
  // env tracks master; a multidev tracks the branch of the same name.
  async unpushedCommits(branch) {
    await this.git(['fetch', 'origin', branch]);
    const out = await this.git([
      'log',
      `origin/${branch}..${branch}`,
      '--date=iso-strict',
      '--format=%H%x1f%an%x1f%ad%x1f%s'
    ]);
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, author, datetime, message] = line.split('\x1f');
        return { hash, author, datetime, message };
      });
  }

  // Pantheon's code log labels each commit with the envs it has reached.
  // Pending for test = on dev, not on test. Pending for live = on test,
  // not on live (env:deploy live ships test's code).
  async pendingCommits(site, env) {
    const source = env === 'test' ? 'dev' : 'test';
    const log = await this.terminusJson(['env:code-log', `${site}.${source}`]);
    return log.filter((commit) => {
      const labels = commit.labels.split(',').map((label) => label.trim());
      return labels.includes(source) && !labels.includes(env);
    });
  }

  async deploy(site, env, note) {
    const since = Date.now() / 1000;
    await this.terminus(['env:deploy', `${site}.${env}`, `--note=${note}`]);
    await this.waitForEnv(site, env, since);
  }

  // Poll workflow:list until every workflow on `env` started at/after
  // `sinceEpoch` is terminal. Throws on a failed workflow or timeout.
  async waitForEnv(site, env, sinceEpoch) {
    const deadline = Date.now() + this.waitTimeoutMs;
    for (;;) {
      const flows = Object.values(
        await this.terminusJson(['workflow:list', site])
      ).filter((w) => w.env === env && w.started_at >= sinceEpoch - 120);
      const active = flows.filter((w) => !TERMINAL_STATUSES.has(w.status));
      if (!active.length) {
        const failed = flows.find((w) => w.status === 'failed');
        if (failed) {
          throw new Error(`Pantheon workflow failed: ${failed.workflow}`);
        }
        return;
      }
      if (Date.now() > deadline) {
        const names = active.map((w) => w.workflow).join(', ');
        throw new Error(`Timed out waiting for workflows on ${env}: ${names}`);
      }
      await sleep(this.pollMs);
    }
  }
}

module.exports = { PantheonApi, matchSite };
