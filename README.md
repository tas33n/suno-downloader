# suno-downloader

Download public Suno audio directly in **JavaScript or TypeScript** with **zero runtime npm dependencies**.

[![npm version](https://img.shields.io/npm/v/suno-downloader.svg)](https://www.npmjs.com/package/suno-downloader)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-brightgreen.svg)](https://nodejs.org)

- ⚡ **Zero runtime dependencies**: Built entirely on Node.js standard libraries.
- 🎵 **Original audio by default**: Fast direct decryption; no FFmpeg required.
- 🔄 **Optional MP3/WAV conversion**: Converts using system FFmpeg when installed.
- 📦 **Dual module formats**: Full ESM and CommonJS support with TypeScript types.
- 🛡️ **No credentials required**: No Suno login, browser automation, or API keys needed.
- 💻 **Includes CLI**: Ready-to-use command-line tool via `npx` or global install.

> **Requirement**: Node.js **22.0.0** or higher.

---

## Installation

### From npm

```sh
npm install suno-downloader
```

### From GitHub

```sh
npm install github:tas33n/suno-downloader
```

---

## CLI Guide

You can run the CLI immediately using `npx` without installing anything globally:

```sh
# Download original audio into the "downloads" folder
npx suno-download "https://suno.com/song/332e8e98-ffc3-4b3c-b359-2fc8c2ec5007" --dir downloads

# Download and convert to MP3 (uses system FFmpeg)
npx suno-download "https://suno.com/song/332e8e98-ffc3-4b3c-b359-2fc8c2ec5007" --format mp3

# Check supported formats and FFmpeg encoder availability
npx suno-download --formats

# Inspect song metadata without downloading audio
npx suno-download "https://suno.com/song/332e8e98-ffc3-4b3c-b359-2fc8c2ec5007" --info

# Save with exact filename (fails if requested conversion is unavailable)
npx suno-download "SUNO_URL" --format wav --strict-format --output song.wav
```

Or install globally for direct `suno-download` command access:

```sh
npm install -g suno-downloader
suno-download --help
```

### CLI Options

| Flag | Description |
| --- | --- |
| `-f, --format <format>` | `original` (default), `mp3`, or `wav` |
| `-d, --dir <directory>` | Destination directory (default: current working directory) |
| `-o, --output <file>` | Exact output filename (extension must match actual format) |
| `--info` | Print song metadata as JSON without downloading audio |
| `--formats` | Show formats available on this system as JSON |
| `--strict-format` | Throw an error if requested conversion is unavailable rather than falling back |
| `--force` | Overwrite existing output file |
| `--no-ffmpeg` | Disable FFmpeg detection and conversion |
| `--ffmpeg <path>` | Custom path to FFmpeg binary |
| `--timeout <secs>` | Request timeout in seconds (default: `120`) |
| `--quiet` | Suppress progress messages |
| `--json` | Output machine-readable result as JSON |
| `-h, --help` | Display help information |

---

## Library Usage

### JavaScript / TypeScript (ESM)

#### 1. Download as Buffer

```ts
import { downloadSong } from 'suno-downloader';
import { writeFile } from 'node:fs/promises';

const songUrl = 'https://suno.com/song/332e8e98-ffc3-4b3c-b359-2fc8c2ec5007';
const audio = await downloadSong(songUrl);

console.log(audio.song.title);   // "Neon Shadows"
console.log(audio.format);       // "m4a" (or actual detected format)
console.log(audio.mimeType);     // "audio/mp4"

// audio.data is a Node.js Buffer
await writeFile(audio.filename, audio.data);
```

#### 2. Stream Directly to Disk (`saveSong`)

`saveSong` streams audio directly to disk, avoiding buffering entire large files in memory:

```ts
import { saveSong } from 'suno-downloader';

const result = await saveSong('https://suno.com/song/332e8e98-ffc3-4b3c-b359-2fc8c2ec5007', {
  directory: './downloads',
  format: 'mp3', // Converts to MP3 if FFmpeg is installed; otherwise saves original
  onProgress({ percent, bytes, totalBytes }) {
    console.log(`Downloading: ${percent}% (${bytes}/${totalBytes} bytes)`);
  },
});

console.log(`Saved to: ${result.path}`);
```

#### 3. Fetch Metadata Only (`getSong`)

```ts
import { getSong } from 'suno-downloader';

const song = await getSong('https://suno.com/song/332e8e98-ffc3-4b3c-b359-2fc8c2ec5007');

console.log(song.title);    // Title
console.log(song.artist);   // Artist username
console.log(song.duration); // Duration in seconds
console.log(song.lyrics);   // Song lyrics (if available)
console.log(song.imageUrl); // Cover artwork URL
```

### CommonJS (CJS)

```js
const { saveSong, getSong } = require('suno-downloader');

async function main() {
  const song = await getSong('https://suno.com/song/332e8e98-ffc3-4b3c-b359-2fc8c2ec5007');
  console.log(`Downloading "${song.title}"...`);

  const saved = await saveSong(song.url, { directory: './downloads' });
  console.log(`Finished: ${saved.path}`);
}

main().catch(console.error);
```

---

## Audio Formats & FFmpeg Conversion

By default, the library extracts the **original decrypted audio container** (typically `.m4a` with AAC or Opus audio, or `.webm` / `.mp3`). No FFmpeg installation is required for default downloads.

### Format Discovery (`getCapabilities`)

Check what formats can be produced on the current machine:

```ts
import { getCapabilities, downloadSong } from 'suno-downloader';

const caps = await getCapabilities();
console.log(caps);
// With FFmpeg (libmp3lame & pcm_s16le encoders available):
// { ffmpeg: { available: true, path: 'ffmpeg' }, formats: ['original', 'mp3', 'wav'] }

// If FFmpeg is missing:
// { ffmpeg: { available: false, path: null }, formats: ['original'] }
```

### Conversion Modes

| Option | Behavior |
| --- | --- |
| `format: 'original'` *(default)* | Decrypts source audio directly. FFmpeg is never invoked. |
| `format: 'mp3'` | Converts to 192 kbps MP3 if `libmp3lame` is available. |
| `format: 'wav'` | Converts to 16-bit PCM WAV if `pcm_s16le` is available. |
| Unavailable conversion *(default fallback)* | Returns original source audio with `fallbackReason: 'ffmpeg-unavailable'` or `'encoder-unavailable'`. |
| Unavailable conversion + `missingFfmpeg: 'error'` | Throws an error immediately before downloading. |

```ts
// Enforce strict conversion (fail instead of falling back to original)
await downloadSong(url, {
  format: 'mp3',
  missingFfmpeg: 'error',
});
```

---

## API Reference

### Exported Functions

| Function | Return Type | Description |
| --- | --- | --- |
| `getSong(url, options?)` | `Promise<Song>` | Fetches metadata only. Does not download audio. |
| `downloadSong(url, options?)` | `Promise<DownloadResult>` | Downloads audio and returns a `Buffer` (`data`). |
| `saveSong(url, options?)` | `Promise<SaveResult>` | Streams audio directly to a file on disk (`path`). |
| `getCapabilities(options?)` | `Promise<Capabilities>` | Inspects local FFmpeg availability and supported output formats. |

### Common Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `format` | `'original' \| 'mp3' \| 'wav'` | `'original'` | Desired audio format. |
| `directory` | `string` | `process.cwd()` | Directory to save audio (used with `saveSong`). |
| `output` | `string` | `undefined` | Exact file path with matching extension (used with `saveSong`). |
| `overwrite` | `boolean` | `false` | Whether to overwrite an existing file. |
| `missingFfmpeg`| `'original' \| 'error'` | `'original'` | Fallback behavior when FFmpeg/encoder is unavailable. |
| `timeout` | `number` | `120000` | HTTP request timeout in milliseconds. |
| `ffmpeg` | `string \| false` | `undefined` | Custom path to FFmpeg binary, or `false` to disable. |
| `onProgress` | `function` | `undefined` | Callback receiving `{ percent, bytes, totalBytes }`. |

### Supported URL Formats

* `https://suno.com/song/<UUID>`
* `https://suno.com/s/<short-code>`
* `https://suno.ai/song/<UUID>`
* Bare song UUID (`332e8e98-ffc3-4b3c-b359-2fc8c2ec5007`)

---

## License

[MIT](LICENSE) © [Tas33n](https://github.com/tas33n)
