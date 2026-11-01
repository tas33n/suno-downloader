export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function parseInput(input) {
  const value = String(input || '').trim();
  if (UUID.test(value)) return { id: value.toLowerCase(), url: `https://suno.com/song/${value.toLowerCase()}` };
  let url;
  try { url = new URL(/^suno\.(com|ai)\//i.test(value) ? `https://${value}` : value); }
  catch { throw new Error('Supply a Suno song URL, short-share URL, or song UUID.'); }
  if (!['https:', 'http:'].includes(url.protocol) || !/^(www\.)?suno\.(com|ai)$/i.test(url.hostname) || url.username || url.password || url.port) {
    throw new Error('Expected a suno.com or suno.ai URL.');
  }
  const match = /^\/(song|s)\/([^/]+)\/?$/.exec(url.pathname);
  if (!match || (match[1] === 'song' ? !UUID.test(match[2]) : !/^[A-Za-z0-9_-]{1,100}$/.test(match[2]))) {
    throw new Error('Use a /song/<UUID> or /s/<share-code> link. Playlists, profiles, and Hooks are not supported.');
  }
  return { id: match[1] === 'song' ? match[2].toLowerCase() : null, url: `https://suno.com/${match[1]}/${match[1] === 'song' ? match[2].toLowerCase() : match[2]}` };
}

function entities(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (all, entity) => {
    if (!entity.startsWith('#')) return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[entity.toLowerCase()];
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });
}

export function metaContent(html, name) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m => [m[1].toLowerCase(), entities(m[3])]));
    if (attrs.property === name || attrs.name === name) return attrs.content || '';
  }
  return '';
}

// Decode React Flight data as text/JSON only; never execute page scripts.
export function flightRecords(html) {
  const payload = [...html.matchAll(/self\.__next_f\.push\(\[\s*1\s*,\s*("(?:\\.|[^"\\])*")\s*\]\)/g)]
    .map(m => JSON.parse(m[1])).join('');
  const bytes = Buffer.from(payload);
  const records = new Map();
  let offset = 0;
  while (offset < bytes.length) {
    const colon = bytes.indexOf(58, offset);
    if (colon < 0) break;
    const id = bytes.subarray(offset, colon).toString();
    if (!/^[\da-f]+$/i.test(id)) {
      const end = bytes.indexOf(10, offset);
      if (end < 0) break;
      offset = end + 1;
      continue;
    }
    if (bytes[colon + 1] === 84) {
      const comma = bytes.indexOf(44, colon + 2);
      if (comma < 0) break;
      const size = parseInt(bytes.subarray(colon + 2, comma).toString(), 16);
      if (!Number.isSafeInteger(size) || size < 0 || comma + 1 + size > bytes.length) break;
      records.set(id, bytes.subarray(comma + 1, comma + 1 + size).toString());
      offset = comma + 1 + size;
      if (bytes[offset] === 10) offset++;
    } else {
      let end = bytes.indexOf(10, colon);
      if (end < 0) end = bytes.length;
      const raw = bytes.subarray(colon + 1, end).toString();
      try { records.set(id, JSON.parse(raw)); } catch { /* Non-data Flight instruction. */ }
      offset = end + 1;
    }
  }
  return records;
}

function findClip(value, id) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.id === 'string' && value.id.toLowerCase() === id && (value.metadata || value.entity_type === 'song_schema')) return value;
  for (const child of Object.values(value)) {
    const found = findClip(child, id);
    if (found) return found;
  }
  return null;
}

export function parseSong(html, requestedId) {
  let id = requestedId;
  if (!id) {
    const canonical = metaContent(html, 'og:url') || html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
    if (canonical) id = parseInput(canonical).id;
  }
  if (!id) throw new Error('The share link did not resolve to a Suno song.');
  const records = flightRecords(html);
  let clip;
  for (const value of records.values()) { clip = findClip(value, id); if (clip) break; }
  function resolve(value, seen = new Set()) {
    if (typeof value === 'string') {
      const ref = /^\$[LSH]?([\da-f]+)$/i.exec(value);
      if (ref && records.has(ref[1]) && !seen.has(ref[1])) return resolve(records.get(ref[1]), new Set([...seen, ref[1]]));
    }
    if (Array.isArray(value)) return value.map(v => resolve(v, seen));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, seen)]));
    return value;
  }
  clip = resolve(clip || {});
  const title = clip.title || metaContent(html, 'og:title');
  if (!title || /^(Suno|Song not found)$/i.test(title)) throw new Error('Song details are unavailable; check that the song is public.');
  return { id, title, artist: clip.display_name || clip.handle || '', duration: clip.metadata?.duration ?? null,
    style: clip.metadata?.tags || '', lyrics: clip.metadata?.prompt || '',
    imageUrl: clip.image_url || metaContent(html, 'og:image'), videoUrl: clip.video_url || '',
    url: `https://suno.com/song/${id}`, metadataSource: clip.id ? 'flight' : 'opengraph' };
}

export function safeFilename(value) {
  let name = String(value).replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 160).replace(/[. ]+$/g, '');
  if (!name) name = 'suno-song';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  return name;
}
