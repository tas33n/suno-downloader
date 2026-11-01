#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { getCapabilities, getSong, saveSong } from 'suno-downloader';

const help = `Usage: suno-download <suno-url-or-uuid> [options]

Download public Suno audio directly. No account or browser required.

Options:
  -f, --format <format>  original (default), mp3, or wav
  -o, --output <file>    Exact path; extension must match actual audio format
  -d, --dir <directory> Output directory (default: current directory)
      --formats         Show formats available on this system (JSON)
      --info            Print metadata as JSON without downloading audio
      --json            Print the download result as JSON
      --force           Replace an existing output file
      --quiet           Hide progress messages
      --timeout <secs>  Per-request timeout (default: 120)
      --ffmpeg <path>   FFmpeg executable (default: FFMPEG_PATH or PATH)
      --no-ffmpeg        Disable FFmpeg detection and conversion
      --strict-format   Fail rather than fall back when conversion is unavailable
  -h, --help            Show this help

MP3/WAV are optional and require installed FFmpeg encoders.
Without them, returns original audio with its actual extension (usually .m4a).
`;

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    format: { type: 'string', short: 'f', default: 'original' },
    output: { type: 'string', short: 'o' }, dir: { type: 'string', short: 'd' },
    formats: { type: 'boolean' }, info: { type: 'boolean' }, json: { type: 'boolean' },
    force: { type: 'boolean' }, quiet: { type: 'boolean' },
    timeout: { type: 'string', default: '120' }, ffmpeg: { type: 'string' },
    'no-ffmpeg': { type: 'boolean' }, 'strict-format': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { console.log(help); return; }
  const ffmpeg = values['no-ffmpeg'] ? false : values.ffmpeg;
  if (values.formats) { console.log(JSON.stringify(await getCapabilities({ ffmpeg }), null, 2)); return; }
  if (positionals.length !== 1) throw new Error('Supply exactly one Suno URL. Run with --help for usage.');
  const timeout = Number(values.timeout) * 1000;
  const log = message => { if (!values.quiet) console.error(message); };
  if (values.info) { console.log(JSON.stringify(await getSong(positionals[0], { timeout }), null, 2)); return; }
  log('Loading song and downloading audio...');
  let lastPercent = -1;
  const result = await saveSong(positionals[0], {
    format: values.format, output: values.output, directory: values.dir, overwrite: values.force,
    timeout, ffmpeg, missingFfmpeg: values['strict-format'] ? 'error' : 'original',
    onProgress({ percent }) {
      const step = percent === null ? 0 : Math.floor(percent / 10) * 10;
      if (step > lastPercent) { lastPercent = step; log(percent === null ? 'Receiving audio...' : `Downloading: ${step}%`); }
    },
  });
  if (result.fallbackReason) log(`Conversion unavailable (${result.fallbackReason}); saved original ${result.format.toUpperCase()} audio.`);
  console.log(values.json ? JSON.stringify(result, null, 2) : `Saved: ${result.path}`);
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
