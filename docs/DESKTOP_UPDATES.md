# Glimmer Desktop Auto Updates

本文只回答一个问题：如何发布一个能被桌面版自动更新检测到的新版本。

## 已接入内容

- Tauri updater 插件：`tauri-plugin-updater`
- 重启插件：`tauri-plugin-process`
- App 内更新提示：`DesktopUpdateNotice`
- 更新检查地址：`https://github.com/Userneima/Glimmer/releases/latest/download/latest.json`
- 本机签名私钥：`~/.tauri/glimmer-updater.key`
- 项目内只保存公钥，私钥不能提交

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

## 更新生效规则

桌面 App 启动后会在生产环境检查更新。只有当远端 `latest.json` 的 `version` 高于当前 App 版本时，才会显示更新提示。

如果当前版本是 `0.1.0`，GitHub Release 仍然发布 `0.1.0`，不会触发更新。

## 不能乱动

- 不要更换 updater 公钥，除非准备同时更换所有后续 release 的签名私钥。
- 不要把 `~/.tauri/glimmer-updater.key` 放进仓库。
- 不要手写 `latest.json`，用 `npm run desktop:manifest` 生成。
- 不要只上传 `.dmg`，否则 App 内自动更新无法工作。
