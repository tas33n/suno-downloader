import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { SunoClient } from './client.mjs';
import { parseInput, parseSong, safeFilename } from './metadata.mjs';
import { downloadAudio, runFfmpeg, transcode } from './audio.mjs';

const mimeTypes = { m4a: 'audio/mp4', webm: 'audio/webm', mp3: 'audio/mpeg', wav: 'audio/wav' };

function clientOptions(options) {
  const timeout = options.timeout ?? 120000;
  if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 3600000) {
    throw new TypeError('timeout must be an integer between 1000 and 3600000 milliseconds.');
  }
  return { timeout, fetchImpl: options.fetchImpl ?? globalThis.fetch };
}

/** Read public metadata without requesting audio rights or running FFmpeg. */
export async function getSong(input, options = {}) {
  const parsed = parseInput(input);
  const client = new SunoClient(clientOptions(options));
  return parseSong(await client.songPage(parsed), parsed.id);
}

/** Discover locally available conversions without making any network requests. */
export async function getCapabilities(options = {}) {
  const executable = options.ffmpeg === false ? null : options.ffmpeg ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
  if (executable !== null && (typeof executable !== 'string' || !executable.trim())) throw new TypeError('ffmpeg must be a non-empty executable path or false.');
  const result = { ffmpeg: { available: false, path: executable }, formats: ['original'] };
  if (executable === null) return result;
  try {
    const encoders = await runFfmpeg(executable, ['-hide_banner', '-encoders'], { timeout: 10000 });
    result.ffmpeg.available = true;
    if (/^\s*A\S*\s+libmp3lame\s/m.test(encoders)) result.formats.push('mp3');
    if (/^\s*A\S*\s+pcm_s16le\s/m.test(encoders)) result.formats.push('wav');
  } catch { /* Unavailable or unusable FFmpeg: original audio still works. */ }
  return result;
}

async function prepare(input, options, consume) {
  const requestedFormat = options.format ?? 'original';
  if (!['original', 'mp3', 'wav'].includes(requestedFormat)) throw new TypeError('format must be original, mp3, or wav.');
  if (options.missingFfmpeg !== undefined && !['original', 'error'].includes(options.missingFfmpeg)) throw new TypeError('missingFfmpeg must be original or error.');
  const parsed = parseInput(input);
  const settings = clientOptions(options);
  let selected = requestedFormat;
  let fallbackReason = null;
  let executable;
  // The default path never spawns a process or probes for FFmpeg.
  if (requestedFormat !== 'original') {
    const capabilities = await getCapabilities(options);
    executable = capabilities.ffmpeg.path;
    if (!capabilities.formats.includes(requestedFormat)) {
      fallbackReason = capabilities.ffmpeg.available ? 'encoder-unavailable' : 'ffmpeg-unavailable';
      if (options.missingFfmpeg === 'error') throw new Error(`${requestedFormat.toUpperCase()} conversion unavailable (${fallbackReason}). Use original audio or install FFmpeg with the required encoder.`);
      selected = 'original';
    }
  }
  const client = new SunoClient(settings);
  const song = parseSong(await client.songPage(parsed), parsed.id);
  const temp = await mkdtemp(join(tmpdir(), 'suno-audio-'));
  try {
    const source = join(temp, 'source');
    const original = await downloadAudio(client, song.id, source, {
      timeout: settings.timeout,
      onProgress(bytes, total) { options.onProgress?.({ bytes, totalBytes: total || null, percent: total ? Math.min(100, bytes / total * 100) : null }); },
    });
    const format = selected === 'original' ? original.format : selected;
    let prepared = source;
    if (selected !== 'original') {
      prepared = join(temp, `converted.${format}`);
      await transcode(source, prepared, format, song, executable);
    }
    const result = {
      song, format, mimeType: mimeTypes[format],
      filename: `${safeFilename(song.title)} [${song.id}].${format}`,
      bytes: (await stat(prepared)).size, sourceFormat: original.format, sourceBytes: original.bytes,
      requestedFormat, converted: selected !== 'original', fallbackReason,
    };
    return await consume(prepared, result);
  } finally { await rm(temp, { recursive: true, force: true }); }
}

/** Return audio as a Buffer. Prefer saveSong for large files. */
export async function downloadSong(input, options = {}) {
  return prepare(input, options, async (file, result) => ({ ...result, data: await readFile(file) }));
}

/** Save audio without buffering the complete result in memory. */
export async function saveSong(input, options = {}) {
  if (options.output && options.directory) throw new TypeError('Choose output or directory, not both.');
  return prepare(input, options, async (file, result) => {
    let output;
    if (options.output) {
      output = resolve(options.output);
      // A fallback must never write M4A bytes to a caller's .mp3/.wav path.
      const expected = `.${result.format}`;
      if (!output.toLowerCase().endsWith(expected)) {
        const error = new Error(`Actual audio format is ${result.format}; output must end with ${expected}. Use directory for automatic filenames.`);
        error.code = 'OUTPUT_FORMAT_MISMATCH';
        throw error;
      }
    } else output = resolve(options.directory || '.', result.filename);
    await mkdir(dirname(output), { recursive: true });
    try { await copyFile(file, output, options.overwrite ? 0 : constants.COPYFILE_EXCL); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error(`File already exists: ${output}. Set overwrite: true to replace it.`, { cause: error });
      throw error;
    }
    return { ...result, path: output };
  });
}
