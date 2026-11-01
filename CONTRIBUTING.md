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

The `research/` folder contains historical investigation notes and local
third-party artifact snapshots. Those downloaded assets are reference material,
not project-authored MIT code, and are excluded from the npm package. New
implementation code should be authored independently rather than copied from
downloaded bundles.

## Packaging and releasing

1. Run `npm ci` and `npm run check`.
2. Update the version and changelog.
3. Run `npm pack --dry-run` to review the allowlisted files.
4. Run `npm pack` and test installing the resulting `.tgz` in a separate project.
   `npm run test:package` automates installation and ESM/CommonJS/CLI smoke checks.
5. Confirm the package name is available (or choose an npm scope).
6. An authorized maintainer can run `npm publish --access public` after signing
   in to npm. The build runs automatically before packaging.

No automated registry publication is configured.
