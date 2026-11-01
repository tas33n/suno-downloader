import type { Buffer } from 'node:buffer';

export type DownloadFormat = 'original' | 'mp3' | 'wav';
/** Detected container, not necessarily the codec (M4A can contain Opus). */
export type AudioFormat = 'm4a' | 'webm' | 'mp3' | 'wav';
export type FallbackReason = 'ffmpeg-unavailable' | 'encoder-unavailable';

export interface Song {
  id: string;
  title: string;
  artist: string;
  duration: number | null;
  style: string;
  lyrics: string;
  imageUrl: string;
  videoUrl: string;
  url: string;
  metadataSource: 'flight' | 'opengraph';
}

export interface RequestOptions {
  /** Per-request timeout in milliseconds. Default: 120000. */
  timeout?: number;
  /** Optional fetch-compatible transport, useful for tests or custom networking. */
  fetchImpl?: typeof globalThis.fetch;
}

export interface ConversionOptions {
  /** Executable path, or false to disable conversion. Defaults to FFMPEG_PATH or PATH. */
  ffmpeg?: string | false;
}

export interface Progress {
  bytes: number;
  totalBytes: number | null;
  percent: number | null;
}

export interface DownloadOptions extends RequestOptions, ConversionOptions {
  /** Default: original. Conversion is opt-in even when FFmpeg is installed. */
  format?: DownloadFormat;
  /** Default: original. Use error to require the requested conversion. */
  missingFfmpeg?: 'original' | 'error';
  /** Download progress only; conversion does not emit progress events. */
  onProgress?: (progress: Progress) => void;
}

export interface SaveOptions extends DownloadOptions {
  /** Output directory, default current working directory. Cannot combine with output. */
  directory?: string;
  /** Exact file path. Extension must match the actual output format. */
  output?: string;
  /** Default false. */
  overwrite?: boolean;
}

export interface Capabilities {
  ffmpeg: { available: boolean; path: string | null };
  /** Always includes original; mp3/wav appear only if their FFmpeg encoders exist. */
  formats: DownloadFormat[];
}

export interface AudioResult {
  song: Song;
  format: AudioFormat;
  mimeType: 'audio/mp4' | 'audio/webm' | 'audio/mpeg' | 'audio/wav';
  filename: string;
  bytes: number;
  sourceFormat: AudioFormat;
  sourceBytes: number;
  requestedFormat: DownloadFormat;
  converted: boolean;
  fallbackReason: FallbackReason | null;
}

export interface DownloadResult extends AudioResult { data: Buffer }
export interface SaveResult extends AudioResult { path: string }

export function getSong(input: string, options?: RequestOptions): Promise<Song>;
export function getCapabilities(options?: ConversionOptions): Promise<Capabilities>;
export function downloadSong(input: string, options?: DownloadOptions): Promise<DownloadResult>;
export function saveSong(input: string, options?: SaveOptions): Promise<SaveResult>;
