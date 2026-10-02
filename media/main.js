(() => {
  const vscode = acquireVsCodeApi();

  // ── Request/response bridge: spinner stays up until the host resolves,
  // and the host only resolves once Pantheon workflows are terminal. ──
  let seq = 0;
  const inflight = new Map();

  const request = (msg) =>
    new Promise((resolve, reject) => {
      const requestId = ++seq;
      inflight.set(requestId, { resolve, reject });
      vscode.postMessage({ ...msg, requestId });
    });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    const req = inflight.get(msg.requestId);
    if (!req) {
      return;
    }
    inflight.delete(msg.requestId);
    if (msg.type === 'error') {
      req.reject(new Error(msg.message));
    } else {
      req.resolve(msg);
    }
  });

  // ── State & helpers ──
  const app = document.getElementById('app');
  const state = {
    site: null,
    sites: [],
    email: null,
    devMode: null,
    devEnv: 'dev',
    envsSite: null,
    unpushedCount: 0
  };
  const pendingCounts = { test: 0, live: 0 };

  const esc = (text) => {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  };

  const byId = (id) => document.getElementById(id);
  const spin = (label) => `<span class="spinner"></span> ${esc(label)}`;
  const fail = (err) => `<span class="error">${esc(err.message)}</span>`;
  const fmtDate = (iso) => (iso ? iso.replace('T', ' ').slice(0, 16) : '');

  const setStatus = (key, html) => {
    byId(`${key}-status`).innerHTML = html;
  };

  const setBusy = (key, busy) => {
    byId(`card-${key}`).classList.toggle('busy', busy);
    document
      .querySelectorAll(
        `#card-${key} button, #card-${key} textarea, #card-${key} select`
      )
      .forEach((elm) => {
        elm.disabled = busy;
      });
  };

  const syncButtons = () => {
    byId('dev-commit').disabled = !byId('dev-message').value.trim();
    const sync = byId('dev-sync');
    if (sync) {
      sync.disabled = !state.unpushedCount;
    }
    for (const env of ['test', 'live']) {
      byId(`${env}-deploy`).disabled =
        !byId(`${env}-note`).value.trim() || !pendingCounts[env];
    }
  };

  // ── Renderers ──
  const renderLoggedOut = (docsUrl) => {
    app.innerHTML = `
      <div class="center">
        <h2>Not logged in to Terminus</h2>
        <p>Login to Terminus in a terminal, then reload VS Code:</p>
        <pre>terminus auth:login --machine-token=&lt;token&gt;</pre>
        <p><a href="${docsUrl}">Pantheon Terminus docs</a></p>
        <button id="reload">Reload VS Code</button>
      </div>`;
    byId('reload').addEventListener('click', () => {
      vscode.postMessage({ type: 'reload' });
    });
  };

  // Commit lists scroll only past 3 entries.
  const listClass = (commits) =>
    commits.length > 3 ? 'commits scroll' : 'commits';

  const commitList = (commits) =>
    commits
      .map(
        (c) => `
        <div class="commit">
          <div>${esc(c.message)}</div>
          <div class="meta">${esc(c.hash.slice(0, 8))} · ${esc(
            fmtDate(c.datetime)
          )} · ${esc(c.author)}</div>
        </div>`
      )
      .join('');

  const renderDiffstat = (files) => {
    if (!files.length) {
      byId('dev-body').innerHTML =
        '<p class="empty">No uncommitted changes on the dev server.</p>';
      return;
    }
    const rows = files
      .map(
        (f) => `
        <tr>
          <td>${esc(f.file)}</td>
          <td>${esc(f.status)}</td>
          <td class="add">+${esc(f.additions)}</td>
          <td class="del">−${esc(f.deletions)}</td>
        </tr>`
      )
      .join('');
    byId('dev-body').innerHTML = `
      <p class="empty">${files.length} uncommitted change(s) on the dev server:</p>
      <div class="scroll"><table class="diffstat">${rows}</table></div>`;
  };

  const renderUnpushed = (branch, commits) => {
    const label = state.devEnv === 'dev' ? 'Dev' : state.devEnv;
    state.unpushedCount = commits.length;
    const status = commits.length
      ? `<p class="empty">${commits.length} local commit(s) on ${esc(branch)} not pushed to origin/${esc(branch)}.</p>`
      : `<div class="statusblock">Status: Local ${esc(branch)} matches origin/${esc(branch)}.</div>`;
    const list = commits.length
      ? `<div class="${listClass(commits)}">${commitList(commits)}</div>`
      : '';
    byId('dev-body').innerHTML = `
      ${status}
      <button id="dev-sync"${commits.length ? '' : ' disabled'}>Sync to ${esc(label)}</button>
      ${list}`;
    byId('dev-sync').addEventListener('click', () =>
      syncDev(branch, state.unpushedCount)
    );
  };

  const renderPending = (env, commits) => {
    pendingCounts[env] = commits.length;
    const source = env === 'test' ? 'dev' : 'test';
    byId(`${env}-badge`).textContent = `${commits.length} pending`;
    byId(`${env}-body`).innerHTML = commits.length
      ? `<div class="${listClass(commits)}">${commitList(commits)}</div>`
      : `<p class="empty">Up to date with ${source} — nothing to deploy.</p>`;
  };

  const skeleton = () => {
    const cacheButton = (key) =>
      `<button class="icon icon-sm" data-clear="${key}" title="Clear Caches" aria-label="Clear Caches">🧹</button>`;
    const deployCard = (env, label) => `
      <section class="card" id="card-${env}">
        <h2>${env}
          <span class="h2-actions"><span class="badge" id="${env}-badge"></span>${cacheButton(env)}</span>
        </h2>
        <div class="status" id="${env}-status"></div>
        <div class="commitbox">
          <textarea id="${env}-note" rows="2" placeholder="Deploy note"></textarea>
          <button id="${env}-deploy" disabled>${label}</button>
        </div>
        <div class="body" id="${env}-body"></div>
      </section>`;
    const siteOptions = [
      state.site ? '' : '<option value="" selected disabled>Select a site…</option>',
      ...state.sites.map(
        (s) =>
          `<option value="${esc(s)}"${s === state.site ? ' selected' : ''}>${esc(s)}</option>`
      )
    ].join('');
    app.innerHTML = `
      <header>
        <select id="site-select" title="Site">${siteOptions}</select>
        <button id="refresh" class="icon" title="Refresh" aria-label="Refresh">⟳</button>
        <span class="who">${esc(state.email)}</span>
      </header>
      <main>
        <section class="card" id="card-dev">
          <h2>
            <select id="dev-env"><option value="dev" selected>dev</option></select>
            <span class="h2-actions"><span class="badge" id="dev-badge"></span>${cacheButton('dev')}</span>
          </h2>
          <div class="toggle" id="dev-toggle">
            <button data-mode="sftp">SFTP</button>
            <button data-mode="git">Git</button>
          </div>
          <div class="status" id="dev-status"></div>
          <div class="commitbox" id="dev-commitbox" hidden>
            <textarea id="dev-message" rows="3" placeholder="Commit message"></textarea>
            <button id="dev-commit" disabled>Commit to dev</button>
          </div>
          <div class="body" id="dev-body"></div>
        </section>
        ${deployCard('test', 'Deploy Dev → Test')}
        ${deployCard('live', 'Deploy Test → Live')}
      </main>`;

    byId('refresh').addEventListener('click', refreshAll);
    byId('site-select').addEventListener('change', (event) => {
      state.site = event.target.value;
      refreshAll();
    });
    document.querySelectorAll('[data-clear]').forEach((btn) => {
      btn.addEventListener('click', () => clearCache(btn.dataset.clear));
    });
    byId('dev-env').addEventListener('change', (event) => {
      state.devEnv = event.target.value;
      refreshDev();
    });
    byId('dev-toggle').addEventListener('click', (event) => {
      const mode = event.target.dataset && event.target.dataset.mode;
      if (mode) {
        switchMode(mode);
      }
    });
    byId('dev-commit').addEventListener('click', commitDev);
    byId('dev-message').addEventListener('input', syncButtons);
    for (const env of ['test', 'live']) {
      byId(`${env}-deploy`).addEventListener('click', () => deployEnv(env));
      byId(`${env}-note`).addEventListener('input', syncButtons);
    }
  };

  const applyMode = (mode) => {
    state.devMode = mode;
    byId('dev-badge').textContent = mode.toUpperCase();
    byId('dev-commitbox').hidden = mode !== 'sftp';
    document.querySelectorAll('#dev-toggle button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  };

  // ── Actions ──
  const refreshDev = async () => {
    const env = state.devEnv;
    setBusy('dev', true);
    byId('dev-body').innerHTML = '';
    byId('dev-commit').textContent = `Commit to ${env}`;
    setStatus('dev', spin(`Checking ${env} connection mode…`));
    try {
      const { mode } = await request({ type: 'devInfo', site: state.site, env });
      applyMode(mode);
      if (mode === 'sftp') {
        setStatus('dev', spin('Fetching uncommitted changes on the server…'));
        const { files } = await request({
          type: 'diffstat',
          site: state.site,
          env
        });
        renderDiffstat(files);
      } else {
        setStatus('dev', spin('Fetching local commits not pushed to origin…'));
        const { branch, commits } = await request({ type: 'unpushed', env });
        renderUnpushed(branch, commits);
      }
      setStatus('dev', '');
    } catch (err) {
      setStatus('dev', fail(err));
    }
    setBusy('dev', false);
    syncButtons();
  };

  // Multidev envs offer the same controls as dev; reload the list per site.
  const refreshEnvs = async () => {
    if (state.envsSite === state.site) {
      return;
    }
    const select = byId('dev-env');
    try {
      const { envs } = await request({ type: 'multidevs', site: state.site });
      state.envsSite = state.site;
      state.devEnv = 'dev';
      select.innerHTML = ['dev', ...envs]
        .map(
          (e) =>
            `<option value="${esc(e)}"${e === state.devEnv ? ' selected' : ''}>${esc(e)}</option>`
        )
        .join('');
    } catch (err) {
      setStatus('dev', fail(err));
    }
  };

  const refreshPending = async (env) => {
    setBusy(env, true);
    setStatus(env, spin('Fetching pending commits…'));
    try {
      const { commits } = await request({
        type: 'pending',
        site: state.site,
        env
      });
      renderPending(env, commits);
      setStatus(env, '');
    } catch (err) {
      setStatus(env, fail(err));
    }
    setBusy(env, false);
    syncButtons();
  };

  const refreshAll = () => {
    if (!state.site) {
      for (const key of ['dev', 'test', 'live']) {
        setStatus(key, 'Select a site above.');
      }
      return;
    }
    refreshEnvs();
    refreshDev();
    refreshPending('test');
    refreshPending('live');
  };

  const switchMode = async (mode) => {
    if (mode === state.devMode) {
      return;
    }
    setBusy('dev', true);
    setStatus(
      'dev',
      spin(`Switching to ${mode.toUpperCase()} — waiting for Pantheon workflow…`)
    );
    try {
      const res = await request({
        type: 'setMode',
        site: state.site,
        env: state.devEnv,
        mode
      });
      if (res.type === 'setModeCancelled') {
        setStatus('dev', '');
        setBusy('dev', false);
        syncButtons();
        return;
      }
      setBusy('dev', false);
      await refreshDev();
    } catch (err) {
      setStatus('dev', fail(err));
      setBusy('dev', false);
      syncButtons();
    }
  };

  // `key` is the card (dev/test/live); the dev card targets the selected env.
  const clearCache = async (key) => {
    const env = key === 'dev' ? state.devEnv : key;
    setBusy(key, true);
    setStatus(key, spin(`Clearing caches on ${env} — waiting for Pantheon…`));
    try {
      const res = await request({ type: 'clearCache', site: state.site, env });
      setStatus(
        key,
        res.type === 'cacheCleared'
          ? `<div class="statusblock">Caches cleared on ${esc(env)}.</div>`
          : ''
      );
    } catch (err) {
      setStatus(key, fail(err));
    }
    setBusy(key, false);
    syncButtons();
  };

  // After a card's workflow settles (spinner cleared), reload the commit lists
  // of every env downstream of it — on failure too, since Pantheon may have
  // applied part of the change. dev → test → live; a multidev feeds nothing.
  const DOWNSTREAM = { dev: ['test', 'live'], test: ['live'], live: [] };
  const refreshDownstream = (key) => {
    if (key === 'dev' && state.devEnv !== 'dev') {
      return;
    }
    DOWNSTREAM[key].forEach(refreshPending);
  };

  // Git mode: push local commits to origin, deploying them to the env.
  const syncDev = async (branch, count) => {
    const env = state.devEnv;
    setBusy('dev', true);
    setStatus(
      'dev',
      spin(`Pushing to origin/${branch} — waiting for Pantheon sync…`)
    );
    try {
      const res = await request({
        type: 'push',
        site: state.site,
        env,
        branch,
        count
      });
      if (res.type === 'pushCancelled') {
        setStatus('dev', '');
        setBusy('dev', false);
        syncButtons();
        return;
      }
      renderUnpushed(res.branch, res.commits);
      setStatus('dev', '');
    } catch (err) {
      setStatus('dev', fail(err));
    }
    setBusy('dev', false);
    syncButtons();
    refreshDownstream('dev');
  };

  const commitDev = async () => {
    const message = byId('dev-message').value.trim();
    const env = state.devEnv;
    setBusy('dev', true);
    setStatus(
      'dev',
      spin(`Committing on ${env} — waiting for Pantheon workflow…`)
    );
    try {
      const { files } = await request({
        type: 'commit',
        site: state.site,
        env,
        message
      });
      byId('dev-message').value = '';
      renderDiffstat(files);
      setStatus('dev', '');
    } catch (err) {
      setStatus('dev', fail(err));
    }
    setBusy('dev', false);
    syncButtons();
    refreshDownstream('dev');
  };

  const deployEnv = async (env) => {
    const note = byId(`${env}-note`).value.trim();
    setBusy(env, true);
    setStatus(env, spin(`Deploying to ${env} — waiting for Pantheon workflows…`));
    try {
      const res = await request({
        type: 'deploy',
        site: state.site,
        env,
        note,
        count: pendingCounts[env]
      });
      if (res.type === 'deployCancelled') {
        setStatus(env, '');
        setBusy(env, false);
        syncButtons();
        return;
      }
      byId(`${env}-note`).value = '';
      renderPending(env, res.commits);
      setStatus(env, '');
    } catch (err) {
      setStatus(env, fail(err));
    }
    setBusy(env, false);
    syncButtons();
    refreshDownstream(env);
  };

  // ── Boot ──
  const init = async () => {
    try {
      const res = await request({ type: 'init' });
      if (res.type === 'loggedOut') {
        renderLoggedOut(res.docsUrl);
        return;
      }
      state.site = res.site;
      state.sites = res.sites;
      state.email = res.email;
      skeleton();
      refreshAll();
    } catch (err) {
      app.innerHTML = `<div class="center">${fail(err)}</div>`;
    }
  };
  init();
})();
