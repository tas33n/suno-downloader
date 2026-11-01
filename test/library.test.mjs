import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadSong, getCapabilities, getSong, saveSong } from 'suno-downloader';

const id = '332e8e98-ffc3-4b3c-b359-2fc8c2ec5007';

function fixture() {
  const clear = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypM4A '), randomBytes(89)]);
  const key = randomBytes(16), iv = randomBytes(16), glt = 'synthetic-guest-token';
  const wrappingKey = createHash('sha256').update(glt).digest();
  const wrap = data => {
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', wrappingKey, nonce);
    cipher.setAAD(Buffer.from(id));
    const body = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([nonce, body, cipher.getAuthTag()]).toString('base64');
  };
  const cipher = createCipheriv('aes-128-ctr', key, iv);
  const encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
  const clip = { id, title: 'Test song', display_name: 'Artist', metadata: { duration: 1 } };
  const html = `<script>self.__next_f.push([1,${JSON.stringify(`a:${JSON.stringify({ clip })}\n`)}])</script>`;
  const calls = [];
  return { clear, calls, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url === `https://suno.com/song/${id}`) return new Response(html);
    if (url === 'https://suno.com/a/api/mango/rights') return Response.json({ glt, key: wrap(key), iv: wrap(iv) });
    if (url === `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id}.m4a`) return new Response(encrypted, { headers: { 'Content-Length': String(encrypted.length) } });
    throw new Error(`Unexpected request: ${url}`);
  } };
}

test('published ESM and CommonJS entry points expose the same functions', async () => {
  const cjs = createRequire(import.meta.url)('suno-downloader');
  assert.deepEqual(Object.keys(cjs).sort(), ['downloadSong', 'getCapabilities', 'getSong', 'saveSong']);
  assert.equal((await cjs.getCapabilities({ ffmpeg: false })).formats.join(), 'original');
});

test('metadata makes only one request; original Buffer works with FFmpeg disabled', async () => {
  const f = fixture();
  assert.equal((await getSong(id, f)).title, 'Test song');
  assert.equal(f.calls.length, 1);
  const progress = [];
  const result = await downloadSong(id, { fetchImpl: f.fetchImpl, ffmpeg: false, onProgress: p => progress.push(p) });
  assert.deepEqual(result.data, f.clear);
  assert.equal(result.format, 'm4a');
  assert.equal(result.mimeType, 'audio/mp4');
  assert.equal(result.converted, false);
  assert.equal(result.fallbackReason, null);
  assert.equal(progress.at(-1).percent, 100);
});

test('absent FFmpeg exposes original only and requested MP3 falls back truthfully', async () => {
  const ffmpeg = join(tmpdir(), `missing-ffmpeg-${randomBytes(8).toString('hex')}`);
  assert.deepEqual((await getCapabilities({ ffmpeg })).formats, ['original']);
  const result = await downloadSong(id, { ...fixture(), format: 'mp3', ffmpeg });
  assert.equal(result.requestedFormat, 'mp3');
  assert.equal(result.format, 'm4a');
  assert.equal(result.fallbackReason, 'ffmpeg-unavailable');
  assert.ok(result.filename.endsWith('.m4a'));
});

test('strict conversion fails before making network requests', async () => {
  const f = fixture();
  await assert.rejects(downloadSong(id, { ...f, format: 'wav', ffmpeg: false, missingFfmpeg: 'error' }), /conversion unavailable/);
  assert.equal(f.calls.length, 0);
});

test('saveSong chooses actual extension, protects existing files and rejects mislabeled fallback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'suno-library-test-'));
  try {
    const f = fixture();
    const result = await saveSong(id, { ...f, directory, format: 'mp3', ffmpeg: false });
    assert.ok(result.path.endsWith('.m4a'));
    assert.deepEqual(await readFile(result.path), f.clear);
    await assert.rejects(saveSong(id, { ...f, directory }), /already exists/);
    await saveSong(id, { ...f, directory, overwrite: true });
    await assert.rejects(saveSong(id, { ...f, output: join(directory, 'wrong.mp3'), format: 'mp3', ffmpeg: false }), { code: 'OUTPUT_FORMAT_MISMATCH' });
    assert.equal((await readdir(directory)).length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('conversion using installed FFmpeg produces MP3/WAV from synthetic WAV', async t => {
  const capabilities = await getCapabilities();
  if (!capabilities.formats.includes('mp3') || !capabilities.formats.includes('wav')) return t.skip('FFmpeg encoders are not installed');
  const { transcode } = await import('../src/audio.mjs');
  const { writeFile } = await import('node:fs/promises');
  const directory = await mkdtemp(join(tmpdir(), 'suno-convert-test-'));
  try {
    const samples = 8000, wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    const source = join(directory, 'source.wav');
    await writeFile(source, wav);
    for (const format of ['mp3', 'wav']) {
      const output = join(directory, `converted.${format}`);
      await transcode(source, output, format, { title: 'Fixture', artist: 'Tests', style: '', lyrics: '' }, capabilities.ffmpeg.path);
      const bytes = await readFile(output);
      assert.equal(bytes.subarray(0, format === 'mp3' ? 3 : 4).toString(), format === 'mp3' ? 'ID3' : 'RIFF');
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
