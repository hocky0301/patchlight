'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { packageSite, verifySite } = require('../scripts/package.cjs');

function workspace(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'patchlight-package-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}

function fixture(t) {
  const root = workspace(t);
  for (const directory of ['src', 'assets', 'docs', 'examples']) fs.mkdirSync(path.join(root, directory));
  for (const name of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md']) {
    fs.writeFileSync(path.join(root, name), name);
  }
  fs.writeFileSync(path.join(root, 'index.html'), '<link rel="stylesheet" href="src/style.css"><a href="./">Home</a>');
  fs.writeFileSync(path.join(root, 'src/style.css'), 'body { color: #111; }');
  return root;
}

test('real static package contains validated public files and deterministic byte hashes', t => {
  const root = path.resolve(__dirname, '..');
  const destination = path.join(workspace(t), 'site');
  const first = packageSite(root, destination);
  const bytes = fs.readFileSync(path.join(destination, 'manifest.json'));
  const second = packageSite(root, destination);
  assert.deepEqual(first, second);
  assert.deepEqual(bytes, fs.readFileSync(path.join(destination, 'manifest.json')));
  assert.deepEqual(fs.readFileSync(path.join(destination, 'src/app.js')), fs.readFileSync(path.join(root, 'src/app.js')));
  assert.ok(first.files.some(item => item.path === 'examples/starter.json'));
  assert.ok(first.files.some(item => item.path === 'LICENSE'));
  for (const name of ['node_modules', '.git', '.github', 'tests', 'scripts', 'package-lock.json', 'test-results', 'playwright-report']) {
    assert.equal(fs.existsSync(path.join(destination, name)), false, name);
  }
});

test('a broken public link fails before replacing the previous package', t => {
  const root = fixture(t);
  const destination = path.join(root, 'site');
  packageSite(root);
  const before = fs.readFileSync(path.join(destination, 'manifest.json'));
  fs.appendFileSync(path.join(root, 'README.md'), '\n[missing image](docs/missing.png)');
  assert.throws(() => packageSite(root), /Missing packaged link/);
  assert.deepEqual(fs.readFileSync(path.join(destination, 'manifest.json')), before);
  assert.doesNotThrow(() => verifySite(destination));
});

test('an invalid bundled recipe or root-relative runtime asset blocks packaging', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'examples/broken.json'), '{"version":99}');
  assert.throws(() => packageSite(root), /version: 1/);
  fs.rmSync(path.join(root, 'examples/broken.json'));
  fs.appendFileSync(path.join(root, 'index.html'), '<script src="/src/app.js"></script>');
  assert.throws(() => packageSite(root), /Root-relative link/);
});

test('package verification detects changed, missing and unexpected files', t => {
  const root = fixture(t);
  const destination = path.join(root, 'site');
  for (const mutate of [
    () => fs.appendFileSync(path.join(destination, 'index.html'), 'tampered'),
    () => fs.rmSync(path.join(destination, 'LICENSE')),
    () => fs.writeFileSync(path.join(destination, 'unexpected.txt'), 'extra'),
    () => {
      fs.mkdirSync(path.join(destination, 'assets'), { recursive: true });
      fs.writeFileSync(path.join(destination, 'assets/.unexpected'), 'extra');
    }
  ]) {
    packageSite(root);
    mutate();
    assert.throws(() => verifySite(destination), /SHA-256 manifest/);
  }
});

test('packaging rejects source symlinks and unsafe destinations', t => {
  const root = fixture(t);
  fs.symlinkSync('../LICENSE', path.join(root, 'assets/linked-license'));
  assert.throws(() => packageSite(root), /symbolic links/);
  assert.throws(() => packageSite(root, root), /Destination cannot contain/);
  assert.throws(() => packageSite(root, path.dirname(root)), /Destination cannot contain/);
});
