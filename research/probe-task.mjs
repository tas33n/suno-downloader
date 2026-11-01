import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const id = '332e8e98-ffc3-4b3c-b359-2fc8c2ec5007';
const headers = { 'X-UseSuno-Protocol': '1', 'X-UseSuno-Browser': randomUUID(), Origin: 'https://usesuno.com', Referer: 'https://usesuno.com/tools/downloader/' };
const results = [];
for (const [name, url, options] of [
  ['proxy', `https://usesuno.com/api/proxy?url=${encodeURIComponent(`https://suno.com/song/${id}`)}`, {}],
  ['rights', 'https://usesuno.com/api/rights', { method: 'POST', body: JSON.stringify({ content_params: { content_id: id, content_type: 'clip' } }) }],
]) {
  const response = await fetch(url, { ...options, headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000) });
  for (const key of ['X-UseSuno-Identity', 'X-UseSuno-Task']) {
    if (response.headers.get(key)) headers[key] = response.headers.get(key);
  }
  const text = await response.text();
  const result = { name, status: response.status, headers: [...response.headers.keys()], ...(response.ok ? { bytes: text.length, fields: name === 'rights' ? Object.keys(JSON.parse(text)) : undefined } : { error: text }) };
  results.push(result);
  console.log(result);
}
await writeFile('research/task-results.json', JSON.stringify(results, null, 2));
