// JSDOM harness for media/main.js. Loads the webview script into a real DOM,
// fakes acquireVsCodeApi()/postMessage, and gives tests control over the
// request/response bridge and the background poll timers.
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const MAIN_JS = path.join(__dirname, '..', '..', 'media', 'main.js');

// Replaces window.setInterval/setTimeout with fakes so the 5s background
// poll (and any other timer) can be advanced deterministically with tick().
const installFakeTimers = (win) => {
  let nextId = 1;
  const timers = new Map();

  win.setInterval = (fn, ms) => {
    const id = nextId++;
    timers.set(id, { fn, ms, elapsed: 0, repeat: true });
    return id;
  };
  win.setTimeout = (fn, ms) => {
    const id = nextId++;
    timers.set(id, { fn, ms, elapsed: 0, repeat: false });
    return id;
  };
  win.clearInterval = (id) => {
    timers.delete(id);
  };
  win.clearTimeout = (id) => {
    timers.delete(id);
  };

  // Advance virtual time by ms, firing any timers whose interval elapses.
  // Fires in whole-ms steps so repeated short intervals fire multiple times
  // across a larger tick (e.g. tick(5000) against a 5000ms setInterval).
  const tick = (ms) => {
    for (const [id, timer] of [...timers.entries()]) {
      if (!timers.has(id)) {
        continue;
      }
      timer.elapsed += ms;
      while (timer.elapsed >= timer.ms) {
        timer.elapsed -= timer.ms;
        timer.fn();
        if (!timer.repeat) {
          timers.delete(id);
          break;
        }
        if (!timers.has(id)) {
          break;
        }
      }
    }
  };

  return { tick };
};

const load = () => {
  const dom = new JSDOM('<div id="app"></div>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost/'
  });
  const { window: win } = dom;
  const document = win.document;

  const posted = [];
  win.acquireVsCodeApi = () => ({
    postMessage: (msg) => {
      posted.push(msg);
    }
  });

  const timers = installFakeTimers(win);

  const source = fs.readFileSync(MAIN_JS, 'utf8');

  const harness = {
    window: win,
    document,
    posted,
    tick: timers.tick,

    // Dispatches a 'message' event carrying the host's response, stamping
    // requestId from the original request so the bridge resolves it.
    reply(msg, response) {
      win.dispatchEvent(
        new win.MessageEvent('message', {
          data: { ...response, requestId: msg.requestId }
        })
      );
    },

    replyError(msg, message) {
      harness.reply(msg, { type: 'error', message });
    },

    // Waits (polling microtasks) for a posted message matching predicate.
    async waitFor(predicate, { timeoutMs = 1000 } = {}) {
      const start = Date.now();
      for (;;) {
        const found = posted.find(predicate);
        if (found) {
          return found;
        }
        if (Date.now() - start > timeoutMs) {
          throw new Error('waitFor: timed out waiting for posted message');
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
    },

    async nextRequest(type) {
      return harness.waitFor((m) => m.type === type && !m._consumed);
    },

    // Marks a message as consumed so nextRequest(type) does not keep
    // returning the same message after it has been handled.
    consume(msg) {
      msg._consumed = true;
    },

    setHidden(hidden) {
      Object.defineProperty(document, 'hidden', {
        value: hidden,
        configurable: true
      });
    },

    $: (selector) => document.querySelector(selector),
    text: (selector) => {
      const elm = document.querySelector(selector);
      return elm ? elm.textContent : null;
    },
    click: (selector) => {
      const elm = document.querySelector(selector);
      if (!elm) {
        throw new Error(`click: no element matches ${selector}`);
      }
      elm.dispatchEvent(new win.Event('click', { bubbles: true }));
    },
    check: (selector, checked = true) => {
      const elm = document.querySelector(selector);
      if (!elm) {
        throw new Error(`check: no element matches ${selector}`);
      }
      elm.checked = checked;
      elm.dispatchEvent(new win.Event('change', { bubbles: true }));
    },
    type: (selector, value) => {
      const elm = document.querySelector(selector);
      if (!elm) {
        throw new Error(`type: no element matches ${selector}`);
      }
      elm.value = value;
      elm.dispatchEvent(new win.Event('input', { bubbles: true }));
    }
  };

  win.eval(source);

  return harness;
};

// Drives the init -> multidevs -> devInfo -> diffstat/unpushed -> pending
// handshake so tests start from a loaded dashboard. Generic over message
// shapes the webview currently sends; survives UI changes as long as the
// message `type`s (init, multidevs, devInfo, diffstat/unpushed, pending)
// stay the same.
const boot = async (
  h,
  {
    email = 'user@example.test',
    site = 'example-site',
    sites = ['example-site'],
    multidevs = [],
    devMode = 'git',
    diffstatFiles = [],
    unpushedBranch = 'master',
    unpushedCommits = [],
    pendingTest = [],
    pendingLive = []
  } = {}
) => {
  const initMsg = await h.nextRequest('init');
  h.consume(initMsg);
  h.reply(initMsg, { type: 'init', email, site, sites });

  const multidevsMsg = await h.nextRequest('multidevs');
  h.consume(multidevsMsg);
  h.reply(multidevsMsg, { type: 'multidevs', envs: multidevs });

  const devInfoMsg = await h.nextRequest('devInfo');
  h.consume(devInfoMsg);
  h.reply(devInfoMsg, { type: 'devInfo', mode: devMode });

  if (devMode === 'sftp') {
    const diffstatMsg = await h.nextRequest('diffstat');
    h.consume(diffstatMsg);
    h.reply(diffstatMsg, { type: 'diffstat', files: diffstatFiles });
  } else {
    const unpushedMsg = await h.nextRequest('unpushed');
    h.consume(unpushedMsg);
    h.reply(unpushedMsg, {
      type: 'unpushed',
      branch: unpushedBranch,
      commits: unpushedCommits
    });
  }

  const pendingMsgs = [];
  for (const env of ['test', 'live']) {
    const msg = await h.waitFor(
      (m) => m.type === 'pending' && m.env === env && !m._consumed
    );
    h.consume(msg);
    pendingMsgs.push(msg);
  }
  h.reply(
    pendingMsgs.find((m) => m.env === 'test'),
    { type: 'pending', env: 'test', commits: pendingTest }
  );
  h.reply(
    pendingMsgs.find((m) => m.env === 'live'),
    { type: 'pending', env: 'live', commits: pendingLive }
  );

  // Let the UI settle (promise microtasks from the request bridge).
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

module.exports = { load, boot };
