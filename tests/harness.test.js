// Smoke test for the webview harness (tests/helpers/webview.js): proves the
// harness can boot media/main.js in jsdom and drive the handshake to a
// rendered dashboard. Not a spec-coverage test — see tests/api.test.js for
// scenario-mapped coverage.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, boot } = require('./helpers/webview');

test('harness › boots the webview and renders dev/test/live cards', async () => {
  const h = load();
  await boot(h, {
    email: 'user@example.test',
    site: 'example-site',
    sites: ['example-site'],
    multidevs: ['alpha', 'themes'],
    devMode: 'git',
    unpushedCommits: [],
    pendingTest: [],
    pendingLive: []
  });

  assert.ok(h.$('#card-dev'), 'dev card renders');
  assert.ok(h.$('#card-test'), 'test card renders');
  assert.ok(h.$('#card-live'), 'live card renders');
  assert.equal(h.text('.who'), 'user@example.test');

  // Multidev list is prepended with "dev" by the webview.
  const options = [...h.$('#dev-env').querySelectorAll('option')].map(
    (o) => o.value
  );
  assert.deepEqual(options, ['dev', 'alpha', 'themes']);
});
