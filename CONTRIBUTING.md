# Contributing

Start with the smallest observable behavior change. Describe the input, the expected output, and what a new visitor will see. Keep a fresh recipe usable within three simple actions and without hardware.

- Preserve the zero-dependency, no-build runtime. A dependency needs a concrete benefit that cannot reasonably fit the existing design.
- Treat `src/core.js` as the source of truth for graph validation and event semantics. Never bypass it in import, URL, storage, or UI code.
- Document behavior changes in `docs/ARCHITECTURE.md`; add meaningful engine or browser tests for new behavior and bug fixes.
- Run `npm run test:all` and `node scripts/package.cjs` before proposing a change; use the commands in README to install development tools. Review desktop/mobile layout and keyboard operation when the UI changes.
- Use only public primary sources for device capabilities. Link the exact source and state what has actually been tested. Do not guess commands, reinterpret undocumented bytes, or claim official-app compatibility.
- Keep physical-device code in an optional adapter phase. Never make the no-hardware experience depend on permissions, a device, or browser Bluetooth support.
- Do not add official logos, copied screenshots, manufacturer-style packaging, private keys, personal device serials, telemetry, or arbitrary JavaScript execution.
- Contributions must be compatible with this project's MIT license. Retain required third-party notices.

For hardware-related contributions, provide the model, firmware, OS/browser versions, tested operations, redacted evidence, and remaining limitations. A mock passing is not physical-device validation.

Small pull requests with a concrete before/after example and relevant validation are preferred. A contributor need not own any hardware to improve the core playground.

Maintainers can follow [RELEASING.md](docs/RELEASING.md) to verify the static package, publish the tested commit, and create a clean source archive.
