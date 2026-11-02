# Contributing

Contributions, bug reports and documentation improvements are welcome. By
contributing, you agree to license your changes under the project's MIT license.

## Development

Use Node.js 22 or newer:

```sh
npm ci
npm run check
```

Source is in `src/`; build outputs in `dist/` are generated. Update
`src/index.d.ts` when changing the public API. `bin/` is a thin CLI wrapper over
the library. Runtime code uses Node built-ins only; development dependencies
build the two module formats and check TypeScript consumers.

Tests use synthetic audio/rights fixtures and mocked HTTP. Run them before
submitting a pull request. Keep live API tests opt-in and avoid including song
downloads, cookies, guest tokens, account data or raw rights responses in issues.
When reporting a bug, include your Node/OS versions, a minimal reproduction,
the error message and whether FFmpeg is installed.

## Packaging and releasing

1. Run `npm ci` and `npm run check`.
2. Update the version in `package.json` (following semantic versioning) and update `CHANGELOG.md`.
3. Run `npm run check:version` to verify the version is valid semver and not already published on npm.
4. Run `npm pack --dry-run` to review the allowlisted files.
5. Push your changes to `main` (or push a tag `git tag vX.Y.Z && git push origin vX.Y.Z`).

Automated publication runs via GitHub Actions (`.github/workflows/publish.yml`):
- Runs full test matrix across Linux, Windows and macOS on Node 22 & 24.
- Validates version semantics and verifies against the npm registry.
- Publishes to npmjs.org using provenance and `--access public`.
- Automatically generates a GitHub Release corresponding to the published version.

Requires repository secret `NPM_TOKEN` (an npm access token with publish rights).
