// Cloudflare Pages Function: /api/info
const UUID_REGEX = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function parseInput(input) {
  const value = String(input || '').trim();
  if (UUID_REGEX.test(value)) return { id: value.toLowerCase(), url: `https://suno.com/song/${value.toLowerCase()}` };
  let url;
  try { url = new URL(/^suno\.(com|ai)\//i.test(value) ? `https://${value}` : value); }
  catch { throw new Error('Provide a valid Suno song URL or UUID.'); }
  if (!['https:', 'http:'].includes(url.protocol) || !/^(www\.)?suno\.(com|ai)$/i.test(url.hostname)) {
    throw new Error('Expected a suno.com or suno.ai URL.');
  }
  const match = /^\/(song|s)\/([^/]+)\/?$/.exec(url.pathname);
  if (!match || (match[1] === 'song' ? !UUID_REGEX.test(match[2]) : !/^[A-Za-z0-9_-]{1,100}$/.test(match[2]))) {
    throw new Error('Use a /song/<UUID> or /s/<share-code> link.');
  }
  return { id: match[1] === 'song' ? match[2].toLowerCase() : null, url: `https://suno.com/${match[1]}/${match[2]}` };
}

function metaContent(html, name) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m => [m[1].toLowerCase(), m[3]]));
    if (attrs.property === name || attrs.name === name) return attrs.content || '';
  }
  return '';
}

function flightRecords(html) {
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
      try { records.set(id, JSON.parse(raw)); } catch {}
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

export async function onRequestGet({ request }) {
  try {
    const urlParam = new URL(request.url).searchParams.get('url');
    if (!urlParam) {
      return new Response(JSON.stringify({ error: 'Missing "url" query parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const parsed = parseInput(urlParam);
    const pageRes = await fetch(parsed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });

    if (!pageRes.ok) {
      return new Response(JSON.stringify({ error: `Suno returned HTTP ${pageRes.status}` }), {
        status: pageRes.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const html = await pageRes.text();
    let id = parsed.id;
    if (!id) {
      const canonical = metaContent(html, 'og:url') || html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
      if (canonical) id = parseInput(canonical).id;
    }

    if (!id) throw new Error('Could not resolve Suno song ID');

    const records = flightRecords(html);
    let clip = null;
    for (const value of records.values()) {
      clip = findClip(value, id);
      if (clip) break;
    }

    const title = clip?.title || metaContent(html, 'og:title') || 'Suno Track';
    const artist = clip?.display_name || clip?.handle || 'Unknown Artist';
    const duration = clip?.metadata?.duration || null;
    const style = clip?.metadata?.tags || '';
    const lyrics = clip?.metadata?.prompt || '';
    const imageUrl = clip?.image_url || metaContent(html, 'og:image') || '';

    return new Response(JSON.stringify({
      id,
      title,
      artist,
      duration,
      style,
      lyrics,
      imageUrl,
      downloadUrl: `/api/download?id=${id}&title=${encodeURIComponent(title)}`
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch song info' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
