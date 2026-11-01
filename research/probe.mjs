import { readFile, writeFile } from 'node:fs/promises';
const id = '332e8e98-ffc3-4b3c-b359-2fc8c2ec5007';
const results = [];
for (const [name, url, options] of [
  ['suno-page', `https://suno.com/song/${id}`],
  ['proxy', `https://usesuno.com/api/proxy?url=${encodeURIComponent(`https://suno.com/song/${id}`)}`],
  ['legacy-mp3', `https://cdn1.suno.ai/${id}.mp3`, { method: 'HEAD' }],
  ['rights', 'https://usesuno.com/api/rights', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ content_params: { content_id: id, content_type: 'clip' } }) }],
]) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  const result = { name, url, status: response.status, type: response.headers.get('content-type'), bytes: Buffer.byteLength(text) };
  if (name === 'rights' && response.ok) result.fields = Object.keys(JSON.parse(text));
  else if (name.includes('page') || name === 'proxy') await writeFile(`research/${name}.html`, text);
  results.push(result);
  console.log(result);
}
await writeFile('research/http-results.json', JSON.stringify(results, null, 2));
const bytes = await readFile('research/rea-evidence.json');
const evidence = JSON.parse(bytes.toString(bytes[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''));
console.log('REA root:', Object.keys(evidence));
await writeFile('research/rea-evidence.json', JSON.stringify(evidence));
await writeFile('research/rea-overview.json', JSON.stringify(evidence, (key, value) => ['nodes', 'edges', 'functions', 'entities'].includes(key) && Array.isArray(value) ? { count: value.length } : value, 2));
