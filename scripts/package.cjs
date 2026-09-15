#!/usr/bin/env node
'use strict';
// Validate and copy public assets without compiling or rewriting their bytes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('../src/core.js');

const PUBLIC_ENTRIES = Object.freeze([
  'index.html', 'src', 'assets', 'docs', 'examples', 'README.md', 'LICENSE',
  'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md'
]);

function collectFiles(root, entries, omitHidden = false) {
  const files = new Map();
  function visit(relative) {
    const filename = path.join(root, relative);
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) throw new Error(`Public assets cannot be symbolic links: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) {
        if (omitHidden && (name.startsWith('.') || name === 'node_modules')) continue;
        visit(path.posix.join(relative, name));
      }
    } else if (stat.isFile()) files.set(relative, fs.readFileSync(filename));
    else throw new Error(`Public asset must be a regular file: ${relative}`);
  }
  for (const entry of entries) visit(entry);
  return new Map([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

function checkLocalLinks(files) {
  for (const [name, bytes] of files) {
    const text = bytes.toString('utf8');
    const extension = path.extname(name);
    const references = extension === '.html'
      ? [...text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/g)].map(match => match[1])
      : extension === '.md'
        ? [...text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+["'][^)]*)?\)/g)].map(match => match[1])
        : extension === '.css'
          ? [...text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)].map(match => match[1])
          : [];
    for (const reference of references) {
      if (!reference || reference.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith('//')) continue;
      if (reference.startsWith('/')) throw new Error(`Root-relative link breaks subdirectory hosting in ${name}: ${reference}`);
      const rawPath = reference.split(/[?#]/)[0];
      let target;
      try { target = path.posix.normalize(path.posix.join(path.posix.dirname(name), decodeURIComponent(rawPath))); }
      catch (_) { throw new Error(`Invalid local URL in ${name}: ${reference}`); }
      if (target === '.' || target.endsWith('/')) target = path.posix.join(target, 'index.html');
      if (!files.has(target)) throw new Error(`Missing packaged link in ${name}: ${reference}`);
    }
  }
}

function manifestFor(files) {
  return {
    version: 1,
    files: [...files].map(([name, bytes]) => ({
      path: name, bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex')
    }))
  };
}

function packageSite(root, destination = path.join(root, 'site')) {
  root = path.resolve(root);
  destination = path.resolve(destination);
  if (root === destination || root.startsWith(destination + path.sep)) throw new Error('Destination cannot contain the source repository');
  if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) throw new Error('Destination cannot be a symbolic link');
  const files = collectFiles(root, PUBLIC_ENTRIES, true);
  checkLocalLinks(files);
  for (const [name, bytes] of files) {
    if (name.startsWith('examples/') && name.endsWith('.json')) core.parse(bytes.toString('utf8'));
  }
  const manifest = manifestFor(files);
  // Preflight completes before replacing an existing, working static package.
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  for (const [name, bytes] of files) {
    const filename = path.join(destination, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, bytes);
  }
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  verifySite(destination);
  return manifest;
}

function verifySite(destination) {
  const names = fs.readdirSync(destination).filter(name => name !== 'manifest.json');
  const files = collectFiles(destination, names);
  const actual = manifestFor(files);
  const expected = JSON.parse(fs.readFileSync(path.join(destination, 'manifest.json'), 'utf8'));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Static package differs from its SHA-256 manifest');
  checkLocalLinks(files);
  return actual;
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--verify')) {
    console.error('Usage: node scripts/package.cjs [--verify]');
    process.exitCode = 1;
  } else {
    const manifest = process.argv[2] === '--verify' ? verifySite(path.join(root, 'site')) : packageSite(root);
    console.log(`Static site verified: ${manifest.files.length} files, SHA-256 manifest in site/manifest.json`);
  }
}

module.exports = { packageSite, verifySite };
