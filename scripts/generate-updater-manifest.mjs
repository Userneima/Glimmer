import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tauriConfig = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const version = tauriConfig.version;
const bundleDir = join(root, 'src-tauri/target/release/bundle/macos');
const signature = readFileSync(join(bundleDir, 'Glimmer.app.tar.gz.sig'), 'utf8').trim();
const tag = process.env.GLIMMER_UPDATE_TAG || `v${version}`;
const baseUrl =
  process.env.GLIMMER_UPDATE_BASE_URL ||
  `https://github.com/Userneima/Glimmer/releases/download/${tag}`;
const notes = process.env.GLIMMER_UPDATE_NOTES || `Glimmer ${version}`;

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': {
      signature,
      url: `${baseUrl}/Glimmer.app.tar.gz`,
    },
  },
};

const output = join(bundleDir, 'latest.json');
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated updater manifest: ${output}`);
