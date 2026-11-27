# Glimmer Desktop Auto Updates

本文只回答一个问题：如何发布一个能被桌面版自动更新检测到的新版本。

## 已接入内容

- Tauri updater 插件：`tauri-plugin-updater`
- 重启插件：`tauri-plugin-process`
- App 内更新提示：`DesktopUpdateNotice`
- 更新检查地址：`https://github.com/Userneima/Glimmer/releases/latest/download/latest.json`
- 本机签名私钥：`~/.tauri/glimmer-updater.key`
- 项目内只保存公钥，私钥不能提交

## 现状

- 最新发布版本是 0.2.0（2026-11-25），开源后的第一个版本；在本机实测过从 0.1.0 点更新提示升到 0.2.0，日记数据完整。
- 安装包只有 Apple Silicon（aarch64），macOS 12 及以上。
- 安装包只做了临时签名（ad-hoc），没有 Apple 开发者认证；别人下载后第一次打开会被系统拦下，发布说明里要写上右键「打开」或 `xattr -cr /Applications/Glimmer.app`。不要用本机钥匙串里的 Apple Development 证书签发布包，证书里带着个人邮箱。

## 发布步骤

1. 修改 `src-tauri/tauri.conf.json` 里的 `version`。
2. 构建桌面包：

```bash
npm run desktop:build
```

3. 生成 updater 清单：

```bash
npm run desktop:manifest
```

4. 在 GitHub Releases 创建对应 tag，例如 `v0.1.1`。
5. 上传以下文件：

```text
src-tauri/target/release/bundle/macos/Glimmer.app.tar.gz
src-tauri/target/release/bundle/macos/latest.json
src-tauri/target/release/bundle/dmg/Glimmer_版本号_aarch64.dmg
```

`.dmg` 是给用户手动下载安装的，`Glimmer.app.tar.gz` 和 `latest.json` 是给自动更新用的。

## 本地开发更新（不发布版本）

日常改完想让 App 自己更新，不手动替换安装包：

```bash
npm run desktop:local-update                 # 生成更新包，App 里点更新
npm run desktop:local-update -- --install    # 第一次接通道：同时装到 /Applications
```

- 版本号是 `X.Y.Z-dev.<时间戳>`。基础版本取「已安装版本」和 `tauri.conf.json` 里版本的高者，所以它一定比当前装的高，又低于同名的正式版；正式发布后照常能收到 GitHub 的更新。
- App 启动时自己起一个只监听 `127.0.0.1:49731` 的静态服务，目录是 `~/Library/Application Support/com.yuchao.glimmer/local-updates`。端口在 `scripts/local-update.config.json`，Rust 服务和构建脚本共用这一份。
- 检查地址是 `http://127.0.0.1:49731/{{current_version}}/latest.json`。本地包比当前版本新才返回本地清单，否则 302 到 GitHub；所以正式版更新不受影响。
- 更新包仍由 updater 私钥签名，签名不对装不上。HTTP 只在这种本地构建里打开（`dangerousInsecureTransportProtocol`），正式发布不带。
- 本地包用 `scripts/local-update.local.json` 里的 `signingIdentity` 签名（本机文件，不提交）。签名身份稳定，macOS 会把每次更新当成同一个 App，日历、下载文件夹这些权限不会每次重问；第一次从临时签名的版本换过来会问一次，换签名身份（包括装回临时签名的公开发布包）会再问一次。没配这个文件就退回临时签名，更新照常能用。
- 本机已装的 App 要用这个脚本更新，不要手动替换 `/Applications/Glimmer.app`：手动换包会让签名身份对不上，权限又会重新询问。
- 没写过本地更新包的机器（包括公开版用户）连端口都不占。
- 服务日志在同目录 `server.log`，能看出 App 什么时候检查、拿到的是本地包还是回 GitHub 了。

## 更新生效规则

桌面 App 启动后会在生产环境检查更新。只有当远端 `latest.json` 的 `version` 高于当前 App 版本时，才会显示更新提示。

如果当前版本是 `0.1.0`，GitHub Release 仍然发布 `0.1.0`，不会触发更新。

## 不能乱动

- 不要更换 updater 公钥，除非准备同时更换所有后续 release 的签名私钥。
- 不要把 `~/.tauri/glimmer-updater.key` 放进仓库。
- 不要手写 `latest.json`，用 `npm run desktop:manifest` 生成。
- 不要只上传 `.dmg`，否则 App 内自动更新无法工作。
