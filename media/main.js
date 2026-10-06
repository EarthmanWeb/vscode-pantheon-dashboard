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
    multidevs: [],
    unpushedCount: 0,
    unpushedSig: null
  };
  // Cards that offer content sync (live is never a sync target).
  const SYNC_KEYS = ['dev', 'test'];
  const pendingCounts = { test: 0, live: 0 };
  // Last note prefilled from pending commit messages; a note the user has
  // edited away from it is never overwritten.
  const notePrefill = { test: '', live: '' };
  // Envs locked from the deploy click until the deploy request settles.
  const deploying = new Set();
  // Open confirm per card: { resolve, opts, yesBtn }.
  const confirms = {};

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
        `#card-${key} button, #card-${key} textarea, #card-${key} select, #card-${key} input`
      )
      .forEach((elm) => {
        elm.disabled = busy;
      });
    if (busy && confirms[key]) {
      confirms[key].yesBtn.disabled = true;
    }
  };

  const syncButtons = () => {
    byId('dev-commit').disabled = !byId('dev-message').value.trim();
    const sync = byId('dev-sync');
    if (sync) {
      sync.disabled = !state.unpushedCount;
    }
    for (const env of ['test', 'live']) {
      const locked =
        deploying.has(env) || byId(`card-${env}`).classList.contains('busy');
      byId(`${env}-note`).disabled = locked;
      byId(`${env}-note-clear`).disabled = locked;
      byId(`${env}-deploy`).disabled =
        locked || !byId(`${env}-note`).value.trim() || !pendingCounts[env];
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
    state.unpushedSig = commits.map((c) => c.hash).join();
    const status = commits.length
      ? `<p class="empty">${commits.length} unpushed local commit(s)</p>`
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
    const note = byId(`${env}-note`);
    if (!note.value.trim() || note.value === notePrefill[env]) {
      notePrefill[env] = commits.map((c) => c.message).join('\n');
      note.value = notePrefill[env];
    }
    const source = env === 'test' ? 'dev' : 'test';
    byId(`${env}-badge`).textContent = `${commits.length} pending`;
    byId(`${env}-body`).innerHTML = commits.length
      ? `<div class="${listClass(commits)}">${commitList(commits)}</div>`
      : `<p class="empty">Up to date with ${source} — nothing to deploy.</p>`;
  };

  const skeleton = () => {
    const iconButton = (attr, icon, title) =>
      `<button class="icon icon-sm" ${attr} title="${title}" aria-label="${title}"><span class="codicon codicon-${icon}"></span></button>`;
    const actions = (key) =>
      (SYNC_KEYS.includes(key)
        ? iconButton(`data-sync="${key}"`, 'sync', 'Sync Content')
        : '') + iconButton(`data-clear="${key}"`, 'clear-all', 'Clear Caches');
    // Slide-down inline confirm; content is filled on open by openConfirm().
    const confirmPanel = (key) => `
      <div class="slide" id="${key}-confirm" inert>
        <div>
          <div class="confirm">
            <p class="confirm-msg" id="${key}-confirm-msg"></p>
            <div id="${key}-confirm-fields"></div>
            <div class="row">
              <button id="${key}-confirm-yes"></button>
              <button class="secondary" id="${key}-confirm-cancel">Cancel</button>
            </div>
          </div>
        </div>
      </div>`;
    const deployCard = (env, label) => `
      <section class="card" id="card-${env}">
        <h2>${env}
          <span class="h2-actions"><span class="badge" id="${env}-badge"></span>${actions(env)}</span>
        </h2>
        ${confirmPanel(env)}
        <div class="status" id="${env}-status"></div>
        <div class="commitbox">
          <div class="clearable">
            <textarea id="${env}-note" rows="2" placeholder="Deploy note"></textarea>
            ${iconButton(`id="${env}-note-clear"`, 'close', 'Clear note')}
          </div>
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
        <button id="refresh" class="icon" title="Refresh" aria-label="Refresh"><span class="codicon codicon-refresh"></span></button>
        <span class="who">${esc(state.email)}</span>
      </header>
      <main>
        <section class="card" id="card-dev">
          <h2>
            <select id="dev-env"><option value="dev" selected>dev</option></select>
            <span class="h2-actions"><span class="badge" id="dev-badge"></span>${actions('dev')}</span>
          </h2>
          ${confirmPanel('dev')}
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
    document.querySelectorAll('[data-sync]').forEach((btn) => {
      btn.addEventListener('click', () => toggleSyncConfirm(btn.dataset.sync));
    });
    for (const key of ['dev', 'test', 'live']) {
      byId(`${key}-confirm-cancel`).addEventListener('click', () =>
        closeConfirm(key)
      );
    }
    byId('dev-env').addEventListener('change', (event) => {
      state.devEnv = event.target.value;
      closeConfirm('dev');
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
      byId(`${env}-note-clear`).addEventListener('click', () => {
        byId(`${env}-note`).value = '';
        syncButtons();
        byId(`${env}-note`).focus();
      });
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

  const requestSetMode = async (env, mode, confirmed) => {
    setBusy('dev', true);
    setStatus('dev', spin(`Switching to ${mode.toUpperCase()}…`));
    try {
      const res = await request({
        type: 'setMode',
        site: state.site,
        env,
        mode,
        confirmed
      });
      if (res.type === 'confirmModeSwitch') {
        setStatus('dev', '');
        setBusy('dev', false);
        syncButtons();
        const result = await openConfirm('dev', {
          message: `Switching ${env} to Git mode discards ${res.count} uncommitted SFTP change(s).`,
          yesLabel: 'Switch to Git'
        });
        if (!result) {
          return;
        }
        await requestSetMode(env, mode, true);
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

  const switchMode = async (mode) => {
    if (mode === state.devMode) {
      return;
    }
    await requestSetMode(state.devEnv, mode, false);
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
      state.multidevs = envs;
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

  // ── Inline confirm (slide-down) ──
  // Sync target: the dev card syncs into the selected dev/multidev env.
  const syncTarget = (key) => (key === 'dev' ? state.devEnv : key);

  // Resolve any confirm still open on `key` with null (new confirm replaces
  // it, or the card is navigated away from).
  const closeConfirm = (key) => {
    const panel = byId(`${key}-confirm`);
    panel.classList.remove('open');
    panel.inert = true;
    byId(`${key}-confirm-fields`).innerHTML = '';
    const entry = confirms[key];
    delete confirms[key];
    if (entry) {
      entry.resolve(null);
    }
  };

  const confirmFieldsHtml = (key, opts) => {
    let html = '';
    if (opts.sync) {
      const target = syncTarget(key);
      const fromOptions = ['dev', 'test', 'live', ...state.multidevs]
        .filter((e) => e !== target)
        .map((e) => `<option value="${esc(e)}">${esc(e)}</option>`)
        .join('');
      html += `
        <label>Sync from <select id="${key}-confirm-from">${fromOptions}</select></label>
        <label><input type="checkbox" id="${key}-confirm-db"> Database</label>
        <label><input type="checkbox" id="${key}-confirm-files"> Files</label>`;
    }
    if (opts.cc) {
      html += `<label><input type="checkbox" id="${key}-confirm-cc"> Clear caches afterwards</label>`;
    }
    return html;
  };

  // Opens the inline confirm on `key`. Resolves to null on Cancel, or
  // { from, db, files, cc } (sync/cc fields only when requested) on yes.
  // Opening a new confirm on a card that already has one resolves it null.
  const openConfirm = (key, opts) => {
    if (confirms[key]) {
      closeConfirm(key);
    }
    const panel = byId(`${key}-confirm`);
    byId(`${key}-confirm-msg`).textContent = opts.message;
    byId(`${key}-confirm-fields`).innerHTML = confirmFieldsHtml(key, opts);
    const yesBtn = byId(`${key}-confirm-yes`);
    yesBtn.textContent = opts.yesLabel;
    const updateYes = () => {
      if (byId(`card-${key}`).classList.contains('busy')) {
        yesBtn.disabled = true;
        return;
      }
      yesBtn.disabled =
        opts.requireContent &&
        !byId(`${key}-confirm-db`).checked &&
        !byId(`${key}-confirm-files`).checked;
    };
    if (opts.sync) {
      byId(`${key}-confirm-db`).addEventListener('change', updateYes);
      byId(`${key}-confirm-files`).addEventListener('change', updateYes);
    }
    updateYes();
    panel.classList.add('open');
    panel.inert = false;
    return new Promise((resolve) => {
      confirms[key] = { resolve, opts, yesBtn };
      yesBtn.onclick = () => {
        const result = {};
        if (opts.sync) {
          result.from = byId(`${key}-confirm-from`).value;
          result.db = byId(`${key}-confirm-db`).checked;
          result.files = byId(`${key}-confirm-files`).checked;
        }
        if (opts.cc) {
          result.cc = byId(`${key}-confirm-cc`).checked;
        }
        panel.classList.remove('open');
        panel.inert = true;
        byId(`${key}-confirm-fields`).innerHTML = '';
        delete confirms[key];
        resolve(result);
      };
    });
  };

  // `key` is the card (dev/test/live); the dev card targets the selected env.
  const clearCache = async (key) => {
    const env = key === 'dev' ? state.devEnv : key;
    const res = await openConfirm(key, {
      message: `Clear all caches on ${env}?`,
      yesLabel: 'Yes'
    });
    if (!res) {
      return;
    }
    setBusy(key, true);
    setStatus(key, spin(`Clearing caches on ${env}…`));
    try {
      await request({ type: 'clearCache', site: state.site, env });
      setStatus(key, `<div class="statusblock">Caches cleared on ${esc(env)}.</div>`);
    } catch (err) {
      setStatus(key, fail(err));
    }
    setBusy(key, false);
    syncButtons();
  };

  // Sync Content icon toggles: clicking it while that card's sync confirm
  // is open closes it.
  const toggleSyncConfirm = (key) => {
    if (confirms[key] && confirms[key].opts.yesLabel === 'Sync') {
      closeConfirm(key);
      return;
    }
    syncContent(key);
  };

  const syncContent = async (key) => {
    const to = syncTarget(key);
    const res = await openConfirm(key, {
      message: `Sync content into ${to}`,
      sync: true,
      cc: true,
      yesLabel: 'Sync',
      requireContent: true
    });
    if (!res) {
      return;
    }
    const { from, db, files, cc } = res;
    setBusy(key, true);
    setStatus(key, spin(`Syncing ${from} → ${to}…`));
    try {
      await request({
        type: 'syncContent',
        site: state.site,
        from,
        to,
        db,
        files,
        cc
      });
      setStatus(
        key,
        `<div class="statusblock">Synced ${esc(from)} → ${esc(to)}.</div>`
      );
    } catch (err) {
      setStatus(key, fail(err));
    }
    setBusy(key, false);
    syncButtons();
  };

  // Background check of the local repo (no fetch) while the dev card is in
  // Git mode, so commits made outside the dashboard show up without Refresh.
  const LOCAL_POLL_MS = 5000;
  let polling = false;
  const devIdle = () =>
    state.devMode === 'git' && !byId('card-dev').classList.contains('busy');
  const pollUnpushed = async () => {
    if (polling || document.hidden || !devIdle()) {
      return;
    }
    polling = true;
    const env = state.devEnv;
    try {
      const { branch, commits } = await request({
        type: 'unpushed',
        env,
        fetch: false
      });
      const sig = commits.map((c) => c.hash).join();
      if (env === state.devEnv && devIdle() && sig !== state.unpushedSig) {
        renderUnpushed(branch, commits);
        syncButtons();
      }
    } catch (err) {
      if (devIdle()) {
        setStatus('dev', fail(err));
      }
    }
    polling = false;
  };

  // Background check for Pantheon workflows running on a card's env —
  // including ones started outside VS Code. While any is active the card
  // shows a spinner; the first poll that sees none clears it and reloads the
  // card. The host also reports `finished` (env -> id of its newest finished
  // workflow, failed included): a changed id on an idle card reloads it too, so
  // workflows that start and end between polls, or while the panel was hidden,
  // are not missed. The first successful poll only records the baseline. A card
  // busy with its own operation is left alone.
  const WORKFLOW_POLL_MS = 5000;
  let workflowPolling = false;
  let lastFinished = {};
  let baselined = false;
  // card key -> env whose workflows its spinner is following.
  const watching = {};
  const cardEnv = (key) => (key === 'dev' ? state.devEnv : key);
  const pollWorkflows = async () => {
    if (workflowPolling || document.hidden || !state.site) {
      return;
    }
    workflowPolling = true;
    const idle = (key) =>
      !watching[key] && !byId(`card-${key}`).classList.contains('busy');
    try {
      const { active, finished } = await request({
        type: 'workflows',
        site: state.site
      });
      const reload = (key) => {
        if (key === 'dev') {
          refreshDev();
        } else {
          refreshPending(key);
        }
        refreshDownstream(key);
      };
      for (const key of ['dev', 'test', 'live']) {
        const names = active[watching[key] || cardEnv(key)] || [];
        const label = (env) => spin(`${names.join(', ')} running on ${env}…`);
        if (idle(key) && names.length) {
          watching[key] = cardEnv(key);
          setBusy(key, true);
          setStatus(key, label(watching[key]));
        } else if (
          watching[key] &&
          names.length &&
          cardEnv(key) === watching[key]
        ) {
          setStatus(key, label(watching[key]));
        } else if (watching[key]) {
          delete watching[key];
          setBusy(key, false);
          setStatus(key, '');
          syncButtons();
          reload(key);
        } else if (
          baselined &&
          idle(key) &&
          !names.length &&
          finished[cardEnv(key)] !== lastFinished[cardEnv(key)]
        ) {
          reload(key);
        }
      }
      lastFinished = finished;
      baselined = true;
    } catch (err) {
      for (const key of ['dev', 'test', 'live']) {
        if (idle(key)) {
          setStatus(key, fail(err));
        }
      }
    }
    workflowPolling = false;
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
    const res = await openConfirm('dev', {
      message: `Push ${count} commit(s) to origin/${branch}? This deploys to ${env}.`,
      sync: true,
      cc: true,
      yesLabel: 'Push'
    });
    if (!res) {
      return;
    }
    setBusy('dev', true);
    setStatus('dev', spin(`Pushing to origin/${branch}…`));
    try {
      const result = await request({
        type: 'push',
        site: state.site,
        env,
        branch,
        count,
        cc: res.cc,
        sync: res.db || res.files ? { from: res.from, db: res.db, files: res.files } : null
      });
      renderUnpushed(result.branch, result.commits);
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
    setStatus('dev', spin(`Committing on ${env}…`));
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
    const count = pendingCounts[env];
    deploying.add(env);
    syncButtons();
    const confirmed = await openConfirm(env, {
      message: `Deploy ${count} commit(s) to ${env.toUpperCase()}?`,
      sync: env === 'test',
      cc: true,
      yesLabel: 'Deploy'
    });
    if (!confirmed) {
      deploying.delete(env);
      syncButtons();
      return;
    }
    setBusy(env, true);
    setStatus(env, spin(`Deploying to ${env}…`));
    try {
      const res = await request({
        type: 'deploy',
        site: state.site,
        env,
        note,
        count,
        cc: confirmed.cc,
        sync:
          env === 'test' && (confirmed.db || confirmed.files)
            ? { from: confirmed.from, db: confirmed.db, files: confirmed.files }
            : null
      });
      byId(`${env}-note`).value = '';
      renderPending(env, res.commits);
      setStatus(env, '');
    } catch (err) {
      setStatus(env, fail(err));
    }
    deploying.delete(env);
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
      setInterval(pollUnpushed, LOCAL_POLL_MS);
      setInterval(pollWorkflows, WORKFLOW_POLL_MS);
    } catch (err) {
      app.innerHTML = `<div class="center">${fail(err)}</div>`;
    }
  };
  init();
})();
