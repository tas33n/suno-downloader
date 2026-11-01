import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'suno-package-test-'));
const npmCli = process.env.npm_execpath;
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const tarball = `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`;
if (!npmCli) throw new Error('Run this script through npm run test:package.');
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: directory, encoding: 'utf8', timeout: 60000 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  console.log(result.stdout.trim());
}
try {
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'suno-package-smoke-test', private: true, type: 'module' }));
  run([npmCli, 'install', resolve(tarball), '--no-audit', '--no-fund']);
  run(['--input-type=module', '-e', "import {getCapabilities} from 'suno-downloader'; console.log(await getCapabilities({ffmpeg:false}));"]);
  run(['--input-type=commonjs', '-e', "const {getCapabilities}=require('suno-downloader'); getCapabilities({ffmpeg:false}).then(console.log);"]);
  run(['node_modules/suno-downloader/bin/suno-download.mjs', '--formats', '--no-ffmpeg']);
  console.log('Packed package installs and works through ESM, CommonJS and CLI.');
} finally { await rm(directory, { recursive: true, force: true }); }
