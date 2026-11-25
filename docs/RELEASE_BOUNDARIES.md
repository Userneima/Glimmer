# Glimmer Release Boundaries

本文只回答一个问题：Glimmer 的 Web 版和桌面 App 版如何分开构建、提交和部署。

## 结论

Glimmer 当前是同一个 React/Vite 前端，同时有两种外壳：

- Web 版：部署到 Vercel，入口是 `dist/`。
- Desktop 版：通过 Tauri 打包，入口是 `src-tauri/target/release/bundle/` 里的原生应用。

两者可以共用 `src/` 里的产品能力，但发布边界必须分开。

## Web / Vercel 边界

Vercel 只负责网页端，不构建桌面 App。

固定命令：

```bash
npm run build:web
```

Vercel 配置写在 `vercel.json`，当前只运行 `build:web`，输出目录是 `dist`。

正式地址：`https://glimmer-diary-kappa.vercel.app`（Vercel 项目 `glimmer-diary`），推到 main 自动部署到 Production。手机和网页都用这个地址，国内要挂代理。

云同步靠 Vercel 项目里的两个 Production 环境变量 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（值与本机 `.env` 相同）。缺了它们，打包出来的网页没有云同步配置、无法登录。改了这两个值要重新部署才生效。

这个 Supabase 项目关闭了公开注册（2026-11-25）：网页版和桌面安装包里都带着公开的 anon key，开着注册的话任何人都能绕开界面注册、往项目里存数据。已有账号照常登录；要加新账号，在 Supabase 后台 Authentication → Users 手动建。

`.vercelignore` 会排除：

- `src-tauri/`
- 桌面启动脚本
- 桌面安装包和原生应用产物
- 本地日志和构建输出

因此修复 Vercel 网页端问题时，不需要上传 Tauri 构建产物。

## Desktop / Tauri 边界

桌面 App 只在本机或专门桌面发布流程里构建。

固定命令：

```bash
npm run desktop:dev
npm run desktop:build
```

Rust 版本固定在 `src-tauri/rust-toolchain.toml`（1.99.1）。Xcode 27.1 的链接器配 rustc 1.95 时，打包会报 `can't find crate for serde_derive` 一类错误，原因是编出来的过程宏库被系统拒绝加载（`mis-aligned LINKEDIT string pool`）；2026-11-03 实测 1.99.1 正常。以后打包再出现同类错误，先升级这个文件里的版本。

桌面自动更新已经接入 Tauri updater。发布可自动更新的新版本时，还需要生成 updater 清单：

```bash
npm run desktop:manifest
```

具体 release 步骤见 `docs/DESKTOP_UPDATES.md`。

桌面快捷方式安装脚本是：

```bash
bash scripts/install-desktop-launcher.sh
```

它会构建 Tauri App，并把 `Glimmer.app` 放到桌面。

## Git 提交边界

可以提交：

- `src/` 里的共享产品代码
- `src-tauri/` 里的桌面端源码和配置
- `scripts/` 里的维护脚本
- `docs/` 里的项目文档

不能提交：

- `src-tauri/target/`
- `*.app/`
- `*.dmg`
- `*.pkg`
- `*.msi`
- `*.exe`
- `dist/`
- 本地日志和密钥文件

## 版本迭代规则

如果一次改动只影响 Web 端，提交信息要说明 Web 目的，不要夹带桌面打包产物。

如果一次改动只影响 Desktop 端，提交信息要说明 Desktop 目的，并确认 `npm run build:web` 仍然通过，避免共享前端被破坏。

如果一次改动同时影响两端，必须分别验证：

```bash
npm run build:web
npm run desktop:build
```

## 已知风险

`package.json` 中同时保留 Web 和 Desktop 脚本是有意设计，不代表 Vercel 会构建桌面端。真正的边界由 `vercel.json`、`.vercelignore` 和脚本命名共同保证。
