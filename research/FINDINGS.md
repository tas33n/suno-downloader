# UseSuno downloader investigation

**Follow-up:** The CLI now calls Suno directly. See [DIRECT-SUNO.md](DIRECT-SUNO.md). The UseSuno flow below is retained as historical investigation evidence.

Observed November 1–2, 2026. Target: `https://usesuno.com/tools/downloader/` and Suno song `332e8e98-ffc3-4b3c-b359-2fc8c2ec5007`.

## Confirmed runtime flow

Browser interaction: pasted the supplied URL, clicked **Download options**, selected **Audio → Original audio**, and observed **SAVED**. The page reported **Neon Shadows**, **DJ Farhan**, approximately **2:10**, no lyrics and no available video.

Instrumented page fetch calls and resource timing showed:

| Step | Request | Observed response |
| --- | --- | --- |
| Metadata | `GET https://usesuno.com/api/proxy?url=https%3A%2F%2Fsuno.com%2Fsong%2F332e8e98-ffc3-4b3c-b359-2fc8c2ec5007` | 200; public page HTML delivered as text/plain |
| Rights | `POST https://usesuno.com/api/rights` | 200; JSON fields `key`, `iv`, `glt` |
| Audio | `GET https://d2lwuy8qc234o3.cloudfront.net/1/clip/332e8e98-ffc3-4b3c-b359-2fc8c2ec5007.m4a` | 200; encrypted bytes, content type audio/mp4 |
| Cover | `GET https://cdn2.suno.ai/image_332e8e98-ffc3-4b3c-b359-2fc8c2ec5007.jpeg` | Resource load observed |
| Video check | `https://cdn1.suno.ai/332e8e98-ffc3-4b3c-b359-2fc8c2ec5007.mp4` | Video resource attempt observed; UI reported unavailable |

Rights request body:

```json
{"content_params":{"content_id":"332e8e98-ffc3-4b3c-b359-2fc8c2ec5007","content_type":"clip"}}
```

## Anonymous admission protocol

`assets/task-access.js` loads before `suno-parser.js` and `suno-media-source.js`. It installs `UseSunoAccess`, making the older verification code's early guard return immediately. Therefore finding CAPTCHA-related code in the other bundles does **not** establish that this download used CAPTCHA.

The active wrapper sends:

- `X-UseSuno-Protocol: 1`
- `X-UseSuno-Browser: <persistent random UUID>`
- `X-UseSuno-Identity: <server-issued identity>` once available
- `X-UseSuno-Task: <unexpired resource-scoped ticket>` once available

It reads response headers `X-UseSuno-Identity`, `X-UseSuno-Task`, `X-UseSuno-Task-Expires` (epoch milliseconds), and `X-UseSuno-Task-Scope` (comma-separated resource names). Metadata admission for `song:<id>` can be reused for that song's rights request. The shipped client handles identity/ticket expiry once and respects 429 quota denials.

Initial plain Node fetches to the proxy and rights API returned **403**. Node requests using the active protocol headers and the site's Origin/Referer returned **200** for both. This experiment changed those headers together; it does not isolate which individual header caused the initial 403. No browser credentials were exported. Reports omit issued identity, ticket, guest token and key values.

Saved HTTP summaries: `http-results.json`, `task-results.json`. `probe.mjs` and `probe-task.mjs` reproduce those bounded probes; running them consumes service requests.

## Local cryptography and conversion

Source: `assets/suno-media-source.js:606–740,920–965,1008–1091`.

1. SHA-256 of UTF-8 `glt` produces a 32-byte wrapping key.
2. Decode each `key`/`iv` field as base64/base64url.
3. First 12 bytes are the AES-GCM nonce. Remaining bytes are ciphertext plus a final 16-byte authentication tag. The UTF-8 song UUID is additional authenticated data.
4. Unwrap the content key and 16-byte IV.
5. Decrypt audio with AES-CTR and a 128-bit counter. Node's streaming cipher maintains counter alignment across arbitrary input chunks.
6. Identify the decrypted container. The CDN `.m4a` suffix alone is not a sufficient check.

The browser optionally decodes audio to PCM and uses `lamejs@1.2.1` for MP3 or builds 16-bit PCM WAV. `browser-id3-writer@4.4.0` adds metadata/cover/lyrics. The CLI implements the protocol independently using Node crypto and FFmpeg; it does not execute the downloaded site scripts.

## Other API/dependency paths found in shipped code

These are static findings unless explicitly marked above; they were not all exercised.

| Endpoint or dependency | Role / evidence |
| --- | --- |
| `/api/health` | Connectivity diagnostic in `suno-parser.js` |
| `/api/playlist`, `/api/profile-songs` | Protected routes recognized by the access wrapper; request schemas were not investigated in the single-song workflow |
| `api.usesuno.com/proxy`, `/playlist` | Alternate origins recognized by the wrapper |
| `rights-api.usesuno.com/rights` | Alternate rights origin recognized by the wrapper |
| `profile-api.usesuno.com/profile-songs` | Alternate profile origin recognized by the wrapper |
| `/api/session`, `/api/session-recaptcha`, `api.usesuno.com/session-recaptcha` | Legacy verification issuers in inactive code on this page |
| Cloudflare Turnstile / Google reCAPTCHA scripts | Legacy verification dependencies; not observed in this download |
| `studio-api-prod.suno.com/api/video/hooks/<id>` | Public Hook metadata path in `suno-parser.js` |
| `cdn1.suno.ai/<id>.mp3` | Legacy/default metadata URL; HEAD returned **403** for this song |
| `cdn1.suno.ai/<id>.mp4` | Published video, also a possible audio-recovery source |
| `cdn2.suno.ai/image_<id>.jpeg` | Cover art |
| `mp4box@2.1.2` on jsDelivr | Public-video audio extraction fallback |
| `jszip@3.10.1` on cdnjs | Browser ZIP generation |
| `lamejs@1.2.1`, `browser-id3-writer@4.4.0` on jsDelivr | Browser conversion and tagging |

The public Suno song page itself also returned 200 from Node. The implementation follows the observed proxy flow to acquire a reusable song task ticket. The `sh` query parameter was unnecessary.

## Evidence and boundaries

Downloaded the HTML and 19 relevant scripts to `research/`. Asset URLs are in `asset-urls.json`. REA CLI static analysis parsed all 19 scripts without parse failures:

- Evidence ID: `ev_41aa5e3a2f5fc81881978795216f36faa404759d09063390e61086c65d4d627a`
- Artifact tree SHA-256: `2225c9ecf6ee80e290e56735e370e40144dc1df91dfe281e154a3ce5886eefb7`
- Complete local evidence: `rea-evidence.json`; condensed graph output: `rea-overview.json`.

REA MCP was unavailable in this session; analysis used the installed CLI. Static analysis treats code as inert text and reports partial graph coverage. Runtime conclusions above come from browser observation and Node/FFmpeg execution, not from static analysis alone. This inventories the APIs relevant to the downloaded single-song assets, not every server endpoint on UseSuno or Suno. Service backend internals remain unknown. Public-video recovery, legacy verification and quota reset behavior were not live-tested.

## Implementation checks

- Five offline tests passed (URL validation, Unicode metadata, filenames, authenticated/streaming decryption, persistent admission/quota behavior).
- Live original download: **2,194,391 bytes**, M4A container, **Opus**, **48 kHz**, **stereo**, **129.56 seconds**.
- Live MP3 download: **3,111,447 bytes**, **192 kbps**, **48 kHz**, **stereo**, **129.5735 seconds** (encoder padding), title/artist tags confirmed.
- Full MP3 decode to FFmpeg's null sink completed without errors.
- Live WAV download: **24,878,498 bytes**, **16-bit PCM**, **48 kHz**, **stereo**, **129.5735 seconds**, confirmed by FFprobe.
- Live short link `https://suno.com/s/kuuNnXWLBeiaN1wU` resolved to `20f569e1-fb1b-4b4e-af8e-8518ffb5837a` (**Hello!**, **Tony**), including multilingual lyrics.
- Browser investigation tab closed after data collection.
