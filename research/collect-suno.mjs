import { mkdir, writeFile } from 'node:fs/promises';
const origin = 'https://suno.com';
const html = await (await fetch(`${origin}/song/332e8e98-ffc3-4b3c-b359-2fc8c2ec5007`)).text();
await mkdir('research/suno-assets', { recursive: true });
const urls = [...new Set([...html.matchAll(/<script[^>]*src=["']([^"']+)/g)].map(m => new URL(m[1], origin).href).filter(u => u.startsWith(`${origin}/_next/`)))];
const matches = [];
for (let i = 0; i < urls.length; i += 8) {
  await Promise.all(urls.slice(i, i + 8).map(async url => {
    const text = await (await fetch(url)).text();
    await writeFile(`research/suno-assets/${url.split('/').pop()}`, text);
    for (const match of text.matchAll(/rights\.suno|content_params|guest.{0,15}token|wrapped_key|AES-GCM|\/rights|glt/g)) {
      matches.push({ url, offset: match.index, excerpt: text.slice(Math.max(0, match.index - 250), match.index + 450) });
    }
  }));
}
await writeFile('research/suno-assets.json', JSON.stringify(urls, null, 2));
await writeFile('research/suno-matches.json', JSON.stringify(matches, null, 2));
console.log(`Downloaded ${urls.length} scripts; ${matches.length} relevant matches.`);
