# Direct Suno rights endpoint

Investigated November 2, 2026, after the UseSuno analysis.

## Confirmed endpoint

```http
POST https://suno.com/a/api/mango/rights
Content-Type: application/json
Origin: https://suno.com
Referer: https://suno.com/

{"content_params":{"content_id":"332e8e98-ffc3-4b3c-b359-2fc8c2ec5007","content_type":"clip"}}
```

No `Authorization` header or cookies were required for this public song in direct Node.js testing. Response: **200**, JSON fields **`key`, `iv`, `glt`**. The same anonymous request succeeded in the logged-in browser using `credentials: 'omit'`. No account tokens were exported.

`glt` is a guest playback token supplied by Suno's server. Its decoded JWT payload reported issuer `https://rights.suno.com` and a lifetime of **3,600 seconds**. Decoding the issuer alone would not establish provenance; the direct HTTPS response from Suno supplies the stronger evidence here. We did not independently verify the HS256 signature.

The `key` and `iv` strings are wrapped values, not the raw media key/IV. As confirmed by Suno's shipped client:

1. Derive the guest wrapping key as `SHA256(UTF8(glt))`.
2. Base64-decode each wrapped value: 12-byte nonce, ciphertext, 16-byte GCM tag.
3. AES-GCM decrypt, using the song UUID as additional authenticated data.
4. Use the resulting 16-byte media key and 16-byte IV for AES-CTR decryption of the CDN stream.

Fresh wrappers/tokens need not be byte-identical between requests. The response must be used as a matching set.

## Logged-in playback differs

In the user's signed-in Suno page, clicked Play for the supplied song and observed:

- `GET https://d2lwuy8qc234o3.cloudfront.net/1/clip/<id>.m4a` → 200.
- `POST https://suno.com/a/api/mango/rights` → 200, JSON fields **`key`, `iv` only**.
- Request header names included `authorization`, `browser-token`, `device-id`, `content-type`, `accept-language`, and tracing headers.

The static client gets a current authenticated token, derives a wrapping key from it, and prefers that key over the guest-token path. Its API middleware inserts the bearer token. That explains why the logged-in response does not need `glt`. This authenticated branch was observed playing successfully; we did not export the bearer token or separately reproduce authenticated decryption in Node.

Playback was paused after inspection, and the investigation tab was closed.

## What this establishes about UseSuno

UseSuno's frontend asks its own `/api/rights` proxy for exactly the response structure that Suno's anonymous playback endpoint supplies. The guest-token issuer, matching request body, encryption scheme and successful direct reproduction strongly support that it proxies Suno's guest rights flow. **The exact UseSuno backend implementation is not visible**, so its precise upstream hostname, caching and request headers remain unconfirmed.

We can obtain the required response directly from Suno; UseSuno is unnecessary for the tested public-song workflow.

## Static source locations

Public Suno page supplied 114 script chunks, saved in `suno-assets/`; URLs in `suno-assets.json`. Bounded string excerpts and offsets are saved in `suno-matches.json`.

- `10_8-li5-0k4n.js`, around offsets 4,100–7,600: guest/authenticated wrapping-key selection, GCM unwrap, CTR streaming, `/api/mango/rights` POST body and cache.
- `1bdrh7c-awmez.js`, around offset 15,200: related HLS rights request with a version parameter (not exercised).
- Module `79076` in the downloaded chunks: current-token getter and API middleware inserting `Authorization: Bearer ...`.

Full-tree REA analysis exceeded its 120-second execution limit. That partial output is not treated as completed evidence. Focused analysis is limited to the two media-rights chunks; runtime observations above are independent browser/Node evidence.

Focused REA evidence: `ev_e92aa0af019fc241be55a152d3005c958caa78d05c841535330a0991f0d0c99d`, saved in `suno-rights-evidence.json`. Both scripts parsed without failures; static graph coverage remains partial.

## CLI changes and verification

- Replaced UseSuno client with direct `SunoClient` in `src/client.mjs`.
- Metadata fetched directly from Suno; no anonymous UseSuno identity/tickets or session-file writes.
- Unchanged cryptographic processing works with Suno's directly issued guest response.
- Six offline tests passed.
- Live direct download saved `downloads/direct-suno.mp3` from **2,194,391 decrypted source bytes**.
- Full FFmpeg decode passed. The direct MP3 and earlier UseSuno-mediated MP3 have the identical SHA-256: `7910f08307492b2d1ead40775904db5c6f44a419baa7535ab038bfdfbe76f0b8`.
- Direct short-share metadata lookup resolved `https://suno.com/s/kuuNnXWLBeiaN1wU` to **Hello! — Tony**, including multilingual lyrics.
- `probe-suno-rights.mjs` reproduces the anonymous rights probe; `direct-suno-results.json` records status, response field names, issuer, token lifetime, and unwrapped byte lengths without saving tokens or keys.

The current CLI supports public-song audio. A successful guest request for these examples does not establish access to private songs or guarantee future API stability.
