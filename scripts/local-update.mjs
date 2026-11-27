// 打一个能通过「应用内更新」装上的本地版本。
//
// 正式发布仍走 GitHub；这里生成的版本号是 X.Y.Z-dev.<时间戳>，比当前安装的版本高，
// 但低于同名的正式版。App 自己起的本地服务把包提供给更新检查，签名仍用更新私钥验证。
//
// 用法：
//   npm run desktop:local-update             只生成更新包，App 里点更新
//   npm run desktop:local-update -- --install  同时把这版装到 /Applications（首次接通道用）
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(join(root, 'scripts/local-update.config.json'), 'utf8'));
const tauriConfig = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const port = config.port;
const githubManifest = 'https://github.com/Userneima/Glimmer/releases/latest/download/latest.json';

// 每次都用同一个证书签名，macOS 才会把更新当成同一个 App，日历、下载文件夹这些权限
// 才不会重装一次问一次。正式发布仍用临时签名，所以这份身份只放本机、不提交。
let signingIdentity = process.env.GLIMMER_LOCAL_SIGNING_IDENTITY || '';
try {
  const localConfig = JSON.parse(
    readFileSync(join(root, 'scripts/local-update.local.json'), 'utf8'),
  );
  if (localConfig.signingIdentity) signingIdentity = localConfig.signingIdentity;
} catch {
  // 没配就退回临时签名，更新照常能用，只是系统权限可能重新询问。
}

const numericParts = (version) => version.split('-')[0].split('.').map((part) => Number(part) || 0);
const compareVersions = (a, b) => {
  const left = numericParts(a);
  const right = numericParts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
};
const bumpPatch = (version) => {
  const [major, minor, patch] = numericParts(version);
  return `${major}.${minor}.${patch + 1}`;
};

const readInstalledVersion = () => {
  try {
    return execFileSync('/usr/bin/defaults', [
      'read',
      '/Applications/Glimmer.app/Contents/Info.plist',
      'CFBundleShortVersionString',
    ]).toString().trim();
  } catch {
    return '';
  }
};

// 版本必须比「正在用的那个」高，否则更新检查不会触发。配置里的版本和已安装版本取高的那个，
// 再升一位补丁号；已经带 -dev. 的只换时间戳。
const installedVersion = readInstalledVersion();
const newest = compareVersions(installedVersion, tauriConfig.version) > 0
  ? installedVersion
  : tauriConfig.version;
const baseVersion = newest.includes('-dev.') ? newest.split('-dev.')[0] : bumpPatch(newest);
const version = `${baseVersion}-dev.${Date.now()}`;

const updaterOverride = {
  version,
  plugins: {
    updater: {
      endpoints: [
        `http://127.0.0.1:${port}/{{current_version}}/latest.json`,
        githubManifest,
      ],
      // 本地端点是 127.0.0.1 上的 HTTP；更新包仍要经过签名校验，正式包不带这个开关。
      dangerousInsecureTransportProtocol: true,
    },
  },
  ...(signingIdentity ? { bundle: { macOS: { signingIdentity } } } : {}),
};

if (!signingIdentity) {
  console.warn('没有配置本机签名身份，这次会用临时签名；系统权限可能在更新后重新询问。');
}

console.log(`本地更新版本：${version}`);
execFileSync(
  'npm',
  ['run', 'desktop:build', '--', '--bundles', 'app', '--config', JSON.stringify(updaterOverride)],
  { cwd: root, stdio: 'inherit' },
);

const bundleDir = join(root, 'src-tauri/target/release/bundle/macos');
const signature = readFileSync(join(bundleDir, 'Glimmer.app.tar.gz.sig'), 'utf8').trim();
const updateDir = join(
  homedir(),
  'Library/Application Support',
  tauriConfig.identifier,
  'local-updates',
);
const platform = process.arch === 'arm64' ? 'darwin-aarch64' : 'darwin-x86_64';

mkdirSync(updateDir, { recursive: true });
copyFileSync(join(bundleDir, 'Glimmer.app.tar.gz'), join(updateDir, 'Glimmer.app.tar.gz'));
writeFileSync(
  join(updateDir, 'latest.json'),
  `${JSON.stringify({
    version,
    notes: `本地更新 ${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
      [platform]: {
        signature,
        url: `http://127.0.0.1:${port}/Glimmer.app.tar.gz`,
      },
    },
  }, null, 2)}\n`,
);

if (process.argv.includes('--install')) {
  let running = false;
  try {
    execFileSync('/usr/bin/pgrep', ['-f', 'Glimmer.app/Contents/MacOS/glimmer']);
    running = true;
  } catch {
    running = false;
  }

  if (running) {
    console.error('Glimmer 正在运行，先退出再安装这一版。');
    process.exit(1);
  }

  execFileSync('rm', ['-rf', '/Applications/Glimmer.app']);
  execFileSync('/usr/bin/ditto', [join(bundleDir, 'Glimmer.app'), '/Applications/Glimmer.app']);
  console.log('已安装到 /Applications/Glimmer.app');
}

console.log(`更新包已就绪：${updateDir}`);
console.log('重开 Glimmer，启动约 2.5 秒后会检查到这一版。');
