import { downloadSong, getSong, getCapabilities, saveSong } from 'suno-downloader';
import type { AudioFormat, DownloadOptions, DownloadResult, SaveResult, Song } from 'suno-downloader';

const options: DownloadOptions = { format: 'mp3', ffmpeg: false, onProgress: p => { const bytes: number = p.bytes; void bytes; } };
const downloaded: DownloadResult = await downloadSong('url', options);
const format: AudioFormat = downloaded.format;
const buffer: Buffer = downloaded.data;
const saved: SaveResult = await saveSong('url', { directory: 'downloads', missingFfmpeg: 'error' });
const song: Song = await getSong('url');
const formats = (await getCapabilities()).formats;
void [format, buffer, saved, song, formats];
// @ts-expect-error Unsupported conversion format
await downloadSong('url', { format: 'flac' });
