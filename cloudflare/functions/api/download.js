// Cloudflare Pages Function: /api/download
import { createDecipheriv, createHash } from 'node:crypto';

const UUID_REGEX = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function safeFilename(value) {
  let name = String(value || '').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').trim().slice(0, 160);
  return name || 'suno-song';
}

function unwrapRights(rights, id) {
  if (!rights || !['glt', 'key', 'iv'].every(k => typeof rights[k] === 'string' && rights[k])) {
    throw new Error('Suno rights response missing guest token, key, or IV.');
  }

  const wrappingKey = createHash('sha256').update(rights.glt).digest();

  function unwrap(value) {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < 28) throw new Error('Invalid wrapped key payload length.');
    const cipher = createDecipheriv('aes-256-gcm', wrappingKey, bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from(id));
    cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]);
  }

  const key = unwrap(rights.key);
  const iv = unwrap(rights.iv);
  return { key, iv };
}

export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const titleParam = url.searchParams.get('title') || 'suno-song';

    if (!id || !UUID_REGEX.test(id)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid song "id" UUID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Request playback rights from Suno
    const rightsRes = await fetch('https://suno.com/a/api/mango/rights', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://suno.com',
        'Referer': 'https://suno.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ content_params: { content_id: id, content_type: 'clip' } }),
    });

    if (!rightsRes.ok) {
      return new Response(JSON.stringify({ error: `Suno rights API returned HTTP ${rightsRes.status}` }), {
        status: rightsRes.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const rights = await rightsRes.json();
    const { key, iv } = unwrapRights(rights, id);

    // 2. Stream encrypted audio from CloudFront CDN
    const cdnRes = await fetch(`https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id}.m4a`);
    if (!cdnRes.ok || !cdnRes.body) {
      return new Response(JSON.stringify({ error: `Audio CDN returned HTTP ${cdnRes.status}` }), {
        status: cdnRes.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Decrypt on-the-fly using AES-CTR and stream directly to client
    const decipher = createDecipheriv(`aes-${key.length * 8}-ctr`, key, iv);

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(decipher.update(chunk));
      },
      flush(controller) {
        controller.enqueue(decipher.final());
      }
    });

    const decryptedBody = cdnRes.body.pipeThrough(transformStream);
    const filename = `${safeFilename(titleParam)} [${id}].m4a`;

    return new Response(decryptedBody, {
      headers: {
        'Content-Type': 'audio/mp4',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Download failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
