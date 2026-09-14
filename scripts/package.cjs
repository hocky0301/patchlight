#!/usr/bin/env node
'use strict';
// Copy only explicitly listed public assets. This is not a compilation step.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'site');
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
for (const name of ['index.html', 'src', 'assets', 'docs', 'examples', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md', 'SECURITY.md']) {
  fs.cpSync(path.join(root, name), path.join(destination, name), { recursive: true });
}
console.log('Static site copied to site/');
