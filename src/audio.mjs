import { createHash, createDecipheriv } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

export function unwrapRights(rights, id) {
  if (!rights || !['glt', 'key', 'iv'].every(k => typeof rights[k] === 'string' && rights[k])) throw new Error('Audio rights response is missing key, IV, or guest token.');
  const wrappingKey = createHash('sha256').update(rights.glt).digest();
  function unwrap(value) {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < 28) throw new Error('Incomplete wrapped audio key/IV.');
    const cipher = createDecipheriv('aes-256-gcm', wrappingKey, bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from(id));
    cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]);
  }
  const key = unwrap(rights.key), iv = unwrap(rights.iv);
  if (![16, 24, 32].includes(key.length) || iv.length !== 16) throw new Error('Invalid content key or IV length.');
  return { key, iv };
}

export function detectFormat(bytes) {
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm';
  if (bytes.subarray(4, 8).toString() === 'ftyp') return 'm4a';
  if (bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0)) return 'mp3';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE') return 'wav';
  throw new Error('Decrypted data is not a recognized audio container.');
}

export async function downloadAudio(client, id, destination, { timeout = 120000, onProgress = () => {} } = {}) {
  const { key, iv } = unwrapRights(await client.rights(id), id);
  const response = await client.fetch(`https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id}.m4a`, { signal: AbortSignal.timeout(timeout), redirect: 'error' });
  if (!response.ok || !response.body) throw new Error(`Audio CDN returned HTTP ${response.status}.`);
  let bytes = 0;
  const total = Number(response.headers.get('content-length')) || 0;
  const progress = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; onProgress(bytes, total); callback(null, chunk); } });
  await pipeline(Readable.fromWeb(response.body), progress, createDecipheriv(`aes-${key.length * 8}-ctr`, key, iv), createWriteStream(destination, { flags: 'wx' }));
  if (!bytes || (total && bytes !== total)) throw new Error('The audio download is incomplete.');
  const file = await open(destination, 'r');
  try {
    const head = Buffer.alloc(16);
    await file.read(head, 0, head.length, 0);
    return { format: detectFormat(head), bytes };
  } finally { await file.close(); }
}

export function runFfmpeg(executable, args, { timeout = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, timeout, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-1000000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-6000); });
    child.once('error', error => reject(new Error(error.code === 'ENOENT' ? 'FFmpeg was not found. Install it or use --format original.' : error.message)));
    child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(`FFmpeg failed (${code}): ${stderr.trim()}`)));
  });
}

export async function transcode(source, destination, format, song, ffmpeg) {
  const codec = format === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '192k', '-id3v2_version', '3'] : ['-c:a', 'pcm_s16le'];
  await runFfmpeg(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', source, '-map', '0:a:0', '-vn',
    ...codec, '-metadata', `title=${song.title}`, '-metadata', `artist=${song.artist}`, '-metadata', `genre=${song.style}`,
    ...(song.lyrics ? ['-metadata', `lyrics=${song.lyrics}`] : []), '-f', format, destination]);
}
