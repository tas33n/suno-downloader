import library = require('suno-downloader');
async function example(): Promise<Buffer> {
  const result = await library.downloadSong('url', { ffmpeg: false });
  return result.data;
}
void example;
