import { writeFile } from 'node:fs/promises';
import { unwrapRights } from '../src/audio.mjs';
const id = '332e8e98-ffc3-4b3c-b359-2fc8c2ec5007';
const url = 'https://suno.com/a/api/mango/rights';
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://suno.com', Referer: `https://suno.com/song/${id}` },
  body: JSON.stringify({ content_params: { content_id: id, content_type: 'clip' } }),
  signal: AbortSignal.timeout(30000),
});
const text = await response.text();
const result = { url, status: response.status, type: response.headers.get('content-type') };
if (response.ok) {
  const data = JSON.parse(text);
  result.fields = Object.keys(data);
  if (data.glt) {
    const { iss, iat, exp } = JSON.parse(Buffer.from(data.glt.split('.')[1], 'base64url'));
    result.guestToken = { issuer: iss, lifetimeSeconds: exp - iat };
    const unwrapped = unwrapRights(data, id);
    result.unwrappedLengths = { key: unwrapped.key.length, iv: unwrapped.iv.length };
  }
} else result.errorPreview = text.slice(0, 300);
console.log(result);
await writeFile('research/direct-suno-results.json', JSON.stringify(result, null, 2));
