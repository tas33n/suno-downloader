import { mkdir, writeFile } from 'node:fs/promises';

const origin = 'https://usesuno.com';
const html = await (await fetch(`${origin}/tools/downloader/`)).text();
await mkdir('research/assets', { recursive: true });
await writeFile('research/downloader.html', html);
const urls = [...html.matchAll(/<script[^>]*src=["']([^"']+)/g)]
  .map(match => new URL(match[1], origin).href)
  .filter(url => url.startsWith(origin) && url.includes('/tools/'));
await Promise.all(urls.map(async url => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  await writeFile(`research/assets/${url.split('/').pop()}`, await response.text());
}));
await writeFile('research/asset-urls.json', JSON.stringify(urls, null, 2));
console.log(`Saved ${urls.length} scripts and downloader HTML.`);
