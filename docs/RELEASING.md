# Release and verification

The repository is the source. `site/` is a generated copy for static hosting; never edit it by hand. A release should identify the commit it contains and distinguish local test results, hosted CI, deployment, and human first-use testing.

## Verify the candidate

Use Node.js 22 or newer. Browser testing is the only step needing development packages or browser downloads.

```sh
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run test:all
node scripts/package.cjs
node scripts/package.cjs --verify
```

`--with-deps` installs required Linux system libraries on supported runners. On a development machine with dependencies already present, `npx playwright install chromium firefox webkit` is sufficient. See [Playwright installation requirements](https://playwright.dev/docs/intro#system-requirements).

Packaging validates the included recipe JSON, checks local links in HTML/CSS/Markdown, rejects root-relative paths that would break a project subdirectory, and rejects symlinked public assets. It copies only the public entry points listed in `scripts/package.cjs`; development dependencies, tests, scripts, and workflow files are excluded. Source files are copied without minification or compilation.

`site/manifest.json` contains sorted file paths, byte lengths, and SHA-256 hashes. Identical inputs produce identical manifest bytes; no timestamp or absolute machine path is included. `--verify` detects changed, missing, or unexpected package files. The manifest is an integrity record, not a signature or proof of authorship.

Review both desktop and mobile layouts after visual changes. Confirm the first-use connection, a numeric condition, sharing/import, keyboard operation, and explicit audio activation. Record exact automated results and remaining limitations in [VALIDATION.md](VALIDATION.md). Keep screenshots in sync with the release candidate.

## Publish the tested commit

1. Commit the reviewed source, docs, test changes, and dependency lockfile. Check `git status --short` for unintended or uncommitted files.
2. Push the candidate and inspect the **Test playground** workflow result for that commit.
3. In repository settings, configure GitHub Pages to use **GitHub Actions**.
4. Run **Publish static site** on the intended branch. It runs the full test suite and packages the same checkout before deployment.
5. Confirm the deployment job succeeded. Open the public URL in a fresh browser session and repeat the first connection.
6. Fetch the hosted `manifest.json` and compare it with the manifest generated from that exact commit. Record the deployed commit and Actions run link.

Publishing stays manual. A push or pull request runs tests and package validation without deploying. All direct actions are pinned to immutable commit hashes. Browser reports and traces are retained for seven days when a workflow fails. See [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Source archives

Create source archives from the tested commit, not by recursively zipping a working directory containing local state. For example, after committing the release candidate:

```sh
git archive --format=zip --prefix=patchlight/ --output=../patchlight-source.zip HEAD
```

This includes the committed README, tests, workflows, and license while excluding untracked preview output and dependencies. Unpack the archive into a fresh directory and rerun `npm test` and static packaging. Record the archive's SHA-256 hash and commit separately. Tag names, release notes, and article claims should refer to the same tested revision.

## Keep evidence distinct

- Browser-engine tests do not establish behavior on every physical phone or tablet.
- Automated interaction speed does not establish that a new person understands the product in 30 seconds; use the [human acceptance procedure](ROADMAP.md#人による30秒確認).
- Publication of this independent playground does not establish official-app compatibility or physical-device support.
