# Suno Downloader - Cloudflare Pages Deployment

Deploy a complete, high-performance Suno AI Music Downloader website with a modern UI and real-time streaming backend on **Cloudflare Pages** (100% free tier compatible).

## Features

- ⚡ **Zero-Disk Streaming**: Decrypts AES-CTR audio chunks on the edge and pipes them directly to the user's browser without disk buffering.
- 🎨 **Modern Dark Web UI**:
  - Live song metadata lookup (title, artist, duration, tags).
  - Artwork display.
  - Built-in audio player to preview songs before downloading.
  - One-click `.m4a` audio download.
  - Lyrics viewer.
- 🌐 **Free Global Edge Hosting**: Runs on Cloudflare's network worldwide with zero server maintenance.

---

## Method 1: Deploy with Wrangler CLI (Fastest)

1. Open your terminal in the `cloudflare` folder:
   ```sh
   cd cloudflare
   ```

2. Log in to your Cloudflare account (if not already logged in):
   ```sh
   npx wrangler login
   ```

3. Deploy to Cloudflare Pages:
   ```sh
   npx wrangler pages deploy public --project-name suno-downloader
   ```

Wrangler will output your live URL (e.g. `https://suno-downloader.pages.dev`).

---

## Method 2: Deploy via Cloudflare Dashboard (Git-connected)

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2. Select your `suno-downloader` repository.
3. Configure the build settings:
   - **Project name**: `suno-downloader`
   - **Framework preset**: None
   - **Root directory**: `cloudflare`
   - **Build output directory**: `public`
4. Under **Settings** > **Functions** > **Compatibility flags**:
   - Add `nodejs_compat`
5. Click **Save and Deploy**.

Your Suno Downloader website will now automatically update on every git push!

---

## Project Structure

```
cloudflare/
├── wrangler.toml                  # Cloudflare Pages config with nodejs_compat enabled
├── public/
│   └── index.html                 # Complete responsive downloader web UI
└── functions/
    └── api/
        ├── info.js                # Fetches metadata and parses React Flight payload
        └── download.js            # Unwraps guest rights and streams decrypted audio
```
