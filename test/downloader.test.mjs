import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseInput, parseSong, safeFilename } from '../src/metadata.mjs';
import { downloadAudio, unwrapRights } from '../src/audio.mjs';
import { SunoClient } from '../src/client.mjs';

const id = '332e8e98-ffc3-4b3c-b359-2fc8c2ec5007';
const page = payload => `<meta property="og:url" content="https://suno.com/song/${id}"><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`;

test('URL validation strips tracking, preserves short-code case, rejects unrelated hosts', () => {
  assert.equal(parseInput(`https://suno.com/song/${id}?sh=anything`).id, id);
  assert.equal(parseInput('https://suno.com/s/AbCd').url, 'https://suno.com/s/AbCd');
  assert.equal(parseInput(id).id, id);
  for (const invalid of ['https://suno.com.evil.test/song/' + id, 'https://evil.test', 'https://user@suno.com/song/' + id, 'https://suno.com/playlist/' + id]) assert.throws(() => parseInput(invalid));
});

test('Flight parsing selects requested song and resolves UTF-8 byte-counted lyrics', () => {
  const lyrics = 'Hello 🌙\nनमस्ते';
  const clip = { id, title: 'Neon', display_name: 'DJ', metadata: { duration: 130, prompt: '$b' } };
  const payload = `a:${JSON.stringify({ recommended: { id: 'another', metadata: {}, title: 'Wrong' }, queries: [{ state: { data: clip } }] })}\nb:T${Buffer.byteLength(lyrics).toString(16)},${lyrics}`;
  const song = parseSong(page(payload));
  assert.equal(song.id, id);
  assert.equal(song.title, 'Neon');
  assert.equal(song.lyrics, lyrics);
  assert.equal(song.metadataSource, 'flight');
});

test('Windows filenames handle reserved words, traversal and control characters', () => {
  assert.equal(safeFilename('CON'), '_CON');
  assert.equal(safeFilename('../hello:world?'), '.._hello_world_');
  assert.equal(safeFilename('...'), 'suno-song');
});

function encryptedFixture() {
  const key = randomBytes(16), iv = randomBytes(16), glt = 'test-only-guest-token';
  const wrappingKey = createHash('sha256').update(glt).digest();
  function wrap(data) {
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', wrappingKey, nonce);
    cipher.setAAD(Buffer.from(id));
    const body = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([nonce, body, cipher.getAuthTag()]).toString('base64url');
  }
  const rights = { glt, key: wrap(key), iv: wrap(iv) };
  const clear = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypM4A '), randomBytes(2111)]);
  const cipher = createCipheriv('aes-128-ctr', key, iv);
  return { rights, clear, encrypted: Buffer.concat([cipher.update(clear), cipher.final()]) };
}

test('key unwrapping authenticates song ID; streaming CTR handles uneven chunks', async () => {
  const fixture = encryptedFixture();
  assert.throws(() => unwrapRights(fixture.rights, 'wrong-song'));
  const directory = await mkdtemp(join(tmpdir(), 'suno-test-'));
  try {
    const body = new ReadableStream({ start(controller) {
      for (let i = 0; i < fixture.encrypted.length; i += 37) controller.enqueue(fixture.encrypted.subarray(i, i + 37));
      controller.close();
    } });
    const client = { rights: async () => fixture.rights, fetch: async () => new Response(body, { headers: { 'content-length': fixture.encrypted.length } }) };
    const output = join(directory, 'audio');
    const result = await downloadAudio(client, id, output);
    assert.equal(result.format, 'm4a');
    assert.deepEqual(await readFile(output), fixture.clear);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('requests metadata and guest rights directly from Suno without credentials', async () => {
  const calls = [];
  const client = new SunoClient({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    return url.includes('/rights') ? Response.json({ key: 'wrapped', iv: 'wrapped', glt: 'guest' }) : new Response('html');
  } });
  assert.equal(await client.songPage(parseInput(id)), 'html');
  assert.equal((await client.rights(id)).glt, 'guest');
  assert.equal(calls[0].url, `https://suno.com/song/${id}`);
  assert.equal(calls[1].url, 'https://suno.com/a/api/mango/rights');
  assert.deepEqual(JSON.parse(calls[1].options.body), { content_params: { content_id: id, content_type: 'clip' } });
});

test('direct client reports rate limits without retries or leaking response bodies', async () => {
  let calls = 0;
  const client = new SunoClient({ fetchImpl: async () => {
    calls++;
    return new Response('sensitive response body', { status: 429, headers: { 'Retry-After': '90' } });
  } });
  await assert.rejects(client.rights(id), error => /429.*90 seconds/.test(error.message) && !error.message.includes('sensitive'));
  assert.equal(calls, 1);
});
