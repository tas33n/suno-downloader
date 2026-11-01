# suno-downloader

Download public Suno audio directly in **JavaScript or TypeScript**. MIT licensed,
ESM and CommonJS compatible, with **zero runtime npm dependencies**.

- Get song metadata, download a `Buffer`, or save directly to a file.
- Original audio by default. No FFmpeg required.
- Optional MP3/WAV conversion using FFmpeg **already installed on your system**.
- Detect available formats before showing conversion choices in your app.
- No Suno login, browser automation, UseSuno service or API key needed.

Requires **Node.js 22+**. This is a server-side Node package, not a browser SDK.
It works in Node backends, scripts, CLIs and Node-based server routes.

## Install

### From this repository (available now)

```sh
git clone https://github.com/tas33n/suno-downloader.git
cd suno-downloader
npm ci
npm run check
npm pack
```

Then, in any other JS/TS project:

```sh
npm install /path/to/suno-downloader-1.0.0.tgz
```

Alternatively, build the repository and install its directory:

```sh
npm install /path/to/suno-downloader
```

Or install directly from GitHub (npm runs the build during installation):

```sh
npm install github:tas33n/suno-downloader
```

### From npm (after publication)

The package is prepared for publication as `suno-downloader`; this repository
does not imply it is already published or that the name is reserved. Once a
maintainer publishes it under that name:

```sh
npm install suno-downloader
```

TypeScript declarations are included. Node TypeScript projects should have
`@types/node` installed as a dev dependency. No separate `@types` package for this
library is needed.

## Quick start: JavaScript / TypeScript (ESM)

```ts
import { downloadSong } from 'suno-downloader';
import { writeFile } from 'node:fs/promises';

const url = 'https://suno.com/song/332e8e98-ffc3-4b3c-b359-2fc8c2ec5007';
const audio = await downloadSong(url);

console.log(audio.song.title); // Neon Shadows
console.log(audio.format);     // m4a for this song
console.log(audio.mimeType);   // audio/mp4
console.log(audio.converted);  // false

await writeFile(audio.filename, audio.data); // data is a Node Buffer
```

Use `.mjs` files or `"type": "module"` in JavaScript projects. For TypeScript,
use a modern Node configuration such as `module: "NodeNext"` and
`moduleResolution: "NodeNext"`.

### CommonJS

```js
const { saveSong } = require('suno-downloader');

async function main() {
  const saved = await saveSong('https://suno.com/song/332e8e98-ffc3-4b3c-b359-2fc8c2ec5007', {
    directory: './downloads',
  });
  console.log(saved.path);
}

main().catch(console.error);
```

`saveSong` streams the source to temporary storage and avoids returning the
entire file as a Buffer. Prefer it for larger files. Both download APIs clean up
their temporary files on success or error.

## Optional conversion and format discovery

The library does **not** install or download FFmpeg. It uses an explicit
`ffmpeg` path, then `FFMPEG_PATH`, then `ffmpeg` on your system PATH.

```ts
import { getCapabilities, downloadSong } from 'suno-downloader';

const capabilities = await getCapabilities();
console.log(capabilities);
// With the required FFmpeg encoders:
// { ffmpeg: { available: true, path: 'ffmpeg' },
//   formats: ['original', 'mp3', 'wav'] }
// Without FFmpeg:
// { ffmpeg: { available: false, path: 'ffmpeg' }, formats: ['original'] }

// These are suitable choices for a format selector in your app.
const selectedFormat = capabilities.formats.includes('mp3') ? 'mp3' : 'original';
const audio = await downloadSong('SUNO_URL', { format: selectedFormat });
```

FFmpeg availability alone is not sufficient: MP3 requires the `libmp3lame`
encoder and WAV requires `pcm_s16le`. `getCapabilities()` checks those encoders
locally without contacting Suno. It performs a fresh check on each call; cache
the result in your application if needed.

| Request | Behavior |
| --- | --- |
| No `format`, or `format: 'original'` | Original decrypted source; never probes or invokes FFmpeg |
| `format: 'mp3'`, encoder available | Convert to 192 kbps MP3 |
| `format: 'wav'`, encoder available | Convert to 16-bit PCM WAV |
| Requested conversion unavailable | Return original audio, with actual format and `fallbackReason` |
| Conversion unavailable and `missingFfmpeg: 'error'` | Throw before downloading |

```ts
const audio = await downloadSong('SUNO_URL', { format: 'mp3' });

// Always use the actual returned format, filename, and MIME type.
if (audio.fallbackReason) {
  console.log(`Using ${audio.format}: ${audio.fallbackReason}`);
}

// Require MP3 rather than accepting the source container:
await downloadSong('SUNO_URL', { format: 'mp3', missingFfmpeg: 'error' });

// Disable conversion explicitly (even when FFmpeg is installed):
await downloadSong('SUNO_URL', { ffmpeg: false });

// Explicit executable path (no shell command or extra arguments):
await downloadSong('SUNO_URL', { format: 'wav', ffmpeg: '/usr/local/bin/ffmpeg' });
```

The source is commonly **M4A**, but the actual container is detected. M4A may
contain **Opus**, not necessarily AAC. Original audio can also be WebM, MP3 or
WAV. Conversion is always opt-in, even on machines with FFmpeg. A conversion
that starts and then fails throws an error rather than silently hiding the
failure. Converted MP3/WAV include available text metadata; cover art is not
embedded. WAV does not restore detail lost in the source encoding.

## Metadata, saving and progress

```ts
import { getSong, saveSong } from 'suno-downloader';
import type { Song, SaveResult } from 'suno-downloader';

const song: Song = await getSong('SUNO_URL');
console.log(song.title, song.artist, song.duration, song.lyrics);

const result: SaveResult = await saveSong('SUNO_URL', {
  directory: './downloads',
  format: 'mp3',
  timeout: 120_000, // milliseconds, per HTTP request
  onProgress({ bytes, totalBytes, percent }) {
    console.log({ bytes, totalBytes, percent });
  },
});
console.log(result.path, result.format, result.fallbackReason);
```

Supported inputs: `suno.com/song/<UUID>`, `suno.com/s/<share-code>`, `suno.ai`
equivalents, or a bare song UUID. Tracking query parameters are ignored.

### Exact filenames

```ts
await saveSong('SUNO_URL', {
  output: './downloads/song.mp3',
  format: 'mp3',
  missingFfmpeg: 'error',
  overwrite: true,
});
```

Choose `output` **or** `directory`. Exact output paths must have the actual
format's extension. If a requested MP3 falls back to M4A, an explicit `.mp3`
path throws `OUTPUT_FORMAT_MISMATCH` instead of writing mislabeled bytes.
Use `directory` to automatically select a correct filename. Existing files are
protected unless `overwrite: true` is set.

## API reference

All four exports return Promises and reject on errors. No function writes to
stdout/stderr or changes the process exit code; only the CLI does that.

| Export | Returns |
| --- | --- |
| `getSong(input, options?)` | `Song` metadata; no audio or FFmpeg request |
| `getCapabilities(options?)` | `{ ffmpeg: { available, path }, formats }` |
| `downloadSong(input, options?)` | `DownloadResult`, including `data: Buffer` |
| `saveSong(input, options?)` | `SaveResult`, including absolute `path` |

### Options

| Option | APIs | Default / meaning |
| --- | --- | --- |
| `timeout` | metadata / downloads | `120000` ms; range `1000`–`3600000` |
| `fetchImpl` | metadata / downloads | Node's `fetch`; optional compatible transport |
| `ffmpeg` | capabilities / downloads | `FFMPEG_PATH` or PATH; executable string or `false` |
| `format` | downloads | `'original'`; also `'mp3'`, `'wav'` |
| `missingFfmpeg` | downloads | `'original'` fallback; use `'error'` for strict mode |
| `onProgress` | downloads | Callback with bytes, nullable totalBytes/percent; download only |
| `directory` | saveSong | Current working directory |
| `output` | saveSong | Exact path with correct extension |
| `overwrite` | saveSong | `false` |

`Song` includes `id`, `title`, `artist`, `duration` (seconds or null), `style`,
`lyrics`, `imageUrl`, `videoUrl`, `url`, and `metadataSource`.

Both result types include `song`, `format`, `mimeType`, `filename`, `bytes`,
`sourceFormat`, `sourceBytes`, `requestedFormat`, `converted`, and
`fallbackReason` (`null`, `'ffmpeg-unavailable'`, or `'encoder-unavailable'`).
`downloadSong` adds `data`; `saveSong` adds `path`.

## CLI

Installing the package provides `suno-download`:

```sh
npx suno-download "SUNO_URL" --dir downloads
npx suno-download --formats
npx suno-download "SUNO_URL" --format mp3 --dir downloads
npx suno-download "SUNO_URL" --format wav --strict-format --output song.wav
npx suno-download "SUNO_URL" --no-ffmpeg --dir downloads
npx suno-download "SUNO_URL" --info
npx suno-download --help
```

Run these after installing the package locally; `npx` resolves the installed
binary. From this repository, run `npm run build` and then
`node bin/suno-download.mjs ...`. CLI `--timeout` is in **seconds**; library
`timeout` is in **milliseconds**. Progress goes to stderr; `--json --quiet`
produces machine-readable output on stdout.

## How it works and current scope

Public metadata comes directly from Suno's page. The package calls Suno's
anonymous playback endpoint, unwraps its guest media key/IV using Node crypto,
and streams AES-CTR-decrypted CDN audio to temporary storage. Keys remain in
memory; there are no account cookies or persistent session files.

This is an independent project, not affiliated with Suno. Its internal playback
API can change, and rate limits are reported without automatic retry loops.
Public single-song audio is supported; private songs, playlists, profiles,
Hooks, video, ZIP and stems are not implemented. The MIT license covers this
software, not rights to downloaded music.

Investigation notes: [direct Suno API](research/DIRECT-SUNO.md) and
[earlier UseSuno investigation](research/FINDINGS.md) (repository only).

## Development and contribution

```sh
npm ci
npm run check        # build, offline tests, ESM/CommonJS TypeScript checks
npm pack --dry-run   # review package contents
```

FFmpeg conversion tests run when the needed encoders exist and are skipped
otherwise; default downloads and missing-FFmpeg behavior are always tested.
CI covers Windows, macOS and Linux on Node 22/24.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and release instructions.
The npm package includes built code, declarations, CLI, README, changelog and
license; local research snapshots, downloaded songs and configuration stay out
of the package.

## License

[MIT](LICENSE). Contributions welcome.
