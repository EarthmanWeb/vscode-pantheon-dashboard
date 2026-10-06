const { run } = require('./shell');

// Workflow statuses Pantheon reports as finished.
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'aborted']);

// Pantheon housekeeping that runs on its own schedule (e.g. the package index
// refresh auto-queued after every live deploy, ~4-5 min). Never caused by a
// dashboard operation, so never waited on.
const BACKGROUND_WORKFLOWS = /Update the Package Index Service|Automated backup/;
const POLL_MS = 4000;
const WAIT_TIMEOUT_MS = 10 * 60 * 1000;
// Database clones of large sites run well past 10 minutes.
const CLONE_TIMEOUT_MS = 60 * 60 * 1000;

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
  // fetch: false compares against the last-fetched origin ref only (cheap,
  // offline — used by the webview's background poll).
  async unpushedCommits(branch, { fetch = true } = {}) {
    if (fetch) {
      await this.git(['fetch', 'origin', branch]);
    }
    return this.logCommits(`origin/${branch}..${branch}`);
  }

  async logCommits(range) {
    const out = await this.git([
      'log',
      range,
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

  // Name of the first git remote whose URL is the Pantheon codeserver. The
  // name varies (origin, pantheon, ...), so match on URL only.
  async pantheonRemote() {
    const out = await this.git(['remote', '-v']);
    const pattern =
      /^ssh:\/\/(?:[^@/\s]+@)?codeserver\.dev\.[^./\s]+\.drush\.in:2222\/~\/repository\.git$/;
    for (const line of out.split('\n')) {
      const [name, url] = line.split(/\s+/);
      if (name && pattern.test(url || '')) {
        return name;
      }
    }
    throw new Error(
      'No Pantheon git remote (ssh://codeserver.dev.<site-id>@codeserver.dev.<site-id>.drush.in:2222/~/repository.git) in this workspace'
    );
  }

  // One fetch shared by concurrent callers (Test and Live load together).
  fetchPantheon() {
    if (this.pantheonFetch) {
      return this.pantheonFetch;
    }
    this.pantheonFetch = (async () => {
      const remote = await this.pantheonRemote();
      await this.git(['fetch', remote, 'master', '--tags']);
      return remote;
    })().finally(() => {
      this.pantheonFetch = null;
    });
    return this.pantheonFetch;
  }

  // Newest Pantheon deploy tag for env; numeric (version) sort.
  async latestDeployTag(env) {
    const out = await this.git([
      'tag',
      '-l',
      `pantheon_${env}_*`,
      '--sort=-v:refname'
    ]);
    const tag = out.split('\n').find(Boolean);
    if (!tag) {
      throw new Error(`No pantheon_${env}_* deploy tag in this repository`);
    }
    return tag;
  }

  // Terminus code-log truncates commit messages to 50 chars, so Pantheon's
  // git deploy tags are the source. Pending for test = pantheon master past
  // the latest test tag. Pending for live = latest test tag past the latest
  // live tag (env:deploy live ships test's code).
  async pendingCommits(site, env) {
    const remote = await this.fetchPantheon();
    const testTag = await this.latestDeployTag('test');
    if (env === 'test') {
      return this.logCommits(`${testTag}..${remote}/master`);
    }
    const liveTag = await this.latestDeployTag('live');
    return this.logCommits(`${liveTag}..${testTag}`);
  }

  // Per env (any origin), excluding Pantheon housekeeping: `active` = names of
  // running workflows; `finished` = id of the newest terminal (succeeded,
  // failed or aborted) workflow by finished_at, so callers can detect
  // workflows that settled between polls.
  async activeWorkflows(site) {
    const flows = await this.terminusJson(['workflow:list', site]);
    const active = {};
    const newest = {};
    for (const w of Object.values(flows)) {
      if (BACKGROUND_WORKFLOWS.test(w.workflow)) {
        continue;
      }
      if (TERMINAL_STATUSES.has(w.status)) {
        if (!newest[w.env] || w.finished_at > newest[w.env].finished_at) {
          newest[w.env] = w;
        }
        continue;
      }
      (active[w.env] ||= []).push(w.workflow);
    }
    const finished = Object.fromEntries(
      Object.entries(newest).map(([env, w]) => [env, w.id])
    );
    return { active, finished };
  }

  async deploy(site, env, note, { cc = false } = {}) {
    const args = ['env:deploy', `${site}.${env}`, `--note=${note}`];
    if (cc) {
      args.push('--cc');
    }
    const since = Date.now() / 1000;
    await this.terminus(args);
    await this.waitForEnv(site, env, since);
  }

  async clearCache(site, env) {
    const since = Date.now() / 1000;
    await this.terminus(['env:clear-cache', `${site}.${env}`]);
    await this.waitForEnv(site, env, since);
  }

  // Copy database and/or files from `from` into `to`. Pantheon logs the
  // "Clone database/files to <to>" workflows (and the --cc cache clear) on the
  // target env, so that is the queue to wait on.
  async cloneContent(site, from, to, { db, files, cc }) {
    const args = ['env:clone-content', `${site}.${from}`, to, '--yes'];
    if (!db && !files) {
      throw new Error('Select database and/or files to sync.');
    }
    if (!files) {
      args.push('--db-only');
    }
    if (!db) {
      args.push('--files-only');
    }
    if (cc) {
      args.push('--cc');
    }
    const since = Date.now() / 1000;
    await this.terminus(args);
    await this.waitForEnv(site, to, since, CLONE_TIMEOUT_MS);
  }

  // Push the local branch to origin (Pantheon), which deploys it to the env,
  // then wait for the env's "Sync code" workflows to finish.
  async push(site, env, branch) {
    const since = Date.now() / 1000;
    await this.git(['push', 'origin', branch]);
    await this.waitForEnv(site, env, since);
  }

  // Poll workflow:list until every workflow on `env` started at/after
  // `sinceEpoch` is terminal. Throws on a failed workflow or timeout.
  async waitForEnv(site, env, sinceEpoch, timeoutMs = this.waitTimeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const flows = Object.values(
        await this.terminusJson(['workflow:list', site])
      ).filter(
        (w) =>
          w.env === env &&
          w.started_at >= sinceEpoch - 120 &&
          !BACKGROUND_WORKFLOWS.test(w.workflow)
      );
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
