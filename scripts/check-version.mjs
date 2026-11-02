import { readFileSync, appendFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;
const name = pkg.name;

console.log(`Checking package: ${name}@${version}`);

// Validate semver format
const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
if (!semverRegex.test(version)) {
  console.error(`Error: Version '${version}' in package.json is not valid semver.`);
  process.exit(1);
}

// Check tag if present
const ref = process.env.GITHUB_REF || '';
if (ref.startsWith('refs/tags/')) {
  const tag = ref.replace('refs/tags/', '');
  const expectedTag = `v${version}`;
  if (tag !== expectedTag && tag !== version) {
    console.error(`Error: Git tag '${tag}' does not match package.json version '${version}' (expected '${expectedTag}').`);
    process.exit(1);
  }
  console.log(`Git tag '${tag}' matches package.json version.`);
}

// Check npm registry
let publishedVersions = [];
try {
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (res.status === 404) {
    console.log(`Package '${name}' is not yet published on npm registry.`);
  } else if (res.ok) {
    const data = await res.json();
    publishedVersions = Object.keys(data.versions || {});
  } else {
    console.warn(`Warning: Received status ${res.status} from npm registry.`);
  }
} catch (err) {
  console.warn(`Warning: Could not contact npm registry (${err.message}).`);
}

const alreadyPublished = publishedVersions.includes(version);

function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  console.log(`Output: ${key}=${value}`);
}

setOutput('name', name);
setOutput('version', version);

if (alreadyPublished) {
  if (ref.startsWith('refs/tags/')) {
    console.error(`Error: Version ${version} is already published on npm. Cannot republish existing version.`);
    process.exit(1);
  }
  console.log(`Notice: Version ${version} is already published on npm. Skipping publish.`);
  setOutput('should_publish', 'false');
} else {
  console.log(`Success: Version ${version} is new and ready for publication.`);
  setOutput('should_publish', 'true');
}

