# Apple Watch 全天录音 + 生理数据 → 自动日记：现成方案调研

调研日期：2026-11-25。依据是公开网页（App Store 页面、官网、FAQ、隐私政策、媒体报道），没有实机试用。标「判断」的是推测，其余是页面上写的。

## 结论

已经有人做了：**Auday**（Apple Watch 全天录音 App）几乎覆盖了需求的全部前半段——全天录音、按小时分段、本机转写中文、每日回顾，并把心率/HRV/睡眠/地点按时间对到对话上。缺的是「自动送进 Glimmer」：它没有 API 和 webhook，只能手动导出 ZIP，或在同一 Wi-Fi 下通过 Auday Skill 让 Mac 上的 agent 读取。

判断：Glimmer 不必自己做录音和对齐，接 Auday 的导出或 Skill 即可，Glimmer 侧只做「读入 → 写日记 → 关联分析」。

## Auday 要点

- 价格：买断，约 9.99 美元（App Store 与官网价格不一致）；AI 总结用自己的 API Key。
- 录音：在手表上开始/停止；接近整点自动分段，约每 15 分钟同步到 iPhone；来电、闹钟、Siri 打断后能续录。官方单次测试：Series 11 录 12.5 小时耗电 51%（不保证）。
- 转写：iPhone 本机转写，支持普通话、粤语；可选云转写（Qwen、豆包、腾讯云、Deepgram 等），需单独同意。
- 日记：每小时摘要 + 每日回顾（需配置 AI 提供方）。
- 生理数据：从 Apple Health 只读心率、HRV（SDNN）、静息心率、步数、睡眠、运动；「压力」是它按个人基线算的估计值，非医学测量；录音期间记录地点。按时间段贴在对话旁，自己说明不代表因果。
- 导出：按日期/小时批量导出 ZIP（M4A 音频、TXT 转写、Markdown AI 内容）；Auday Skill 让 Mac 上的桌面 AI 助手在同一 Wi-Fi 下读取转写、回顾，可选带上身体和地点数据。无 API、无 webhook、无服务器。
- 隐私：数据只在设备上，不进 iCloud 备份（手机丢了无法恢复）；原始音频默认保留 30 天。
- 开发者：个人开发者（App Store 卖家 GUO HANGJIANG），2026-10-02 上架，Founder Park 报道称作者是中科大研一学生，曾登中日付费榜第一。

## 其他方案

- **Apple Siri Recap**（watchOS 27.3，预计 2026-12）：只给全天对话的要点摘要，不留音频、不给全文，需 Series 12 / Ultra 4，没有发现给第三方导出的途径。不适合。
- **VoiceDay、Memova、Flecty**：同类手表录音 App；Flecty 也读 Health 的心率/HRV。功能和导出能力未细查，Auday 更完整。
- **Omi**（开源挂件，非手表）：有实时转写 webhook，最好接，但要多戴一个设备；webhook 不带签名。
- **Health Auto Export**（iOS App，订阅）：可定时把 Apple Health 数据以 JSON POST 到自己的服务器；手机解锁时才能读健康数据。若不用 Auday 的身体数据，可用它单独接生理数据。

## 同类产品价格与能力对比（2026-11-25 补）

| | Auday | Memova | VoiceDay | Flecty | Omi App |
|---|---|---|---|---|---|
| 价格 | 买断约 9.99 美元 + 自带 AI Key | 录音、本机转写、搜索免费；每日回顾等云功能 Pro 39.99 美元/年 | 免费下载，免费额度未写明；终身 24.99 美元、年费 29.99–39.99 美元 | 手表录音要付费，49.99 美元/年，或自带 Key 一次 9.90 美元 | 免费每月 5 小时；Pro 29.99 美元/月 |
| 手表全天录音 | 是，整点分段 | 是，熄屏继续 | 是，续航未写 | 是，官方测 12 小时 | 未见手表录音，只能手机开着 App 或买挂件 |
| 转写 | 本机，普通话/粤语 | 本机，有简体中文 | 本机，有简体中文 | 云端 | 云端 |
| 每日日记 | 有（需 AI Key） | Pro | 有 | 按单次录音，无每日 | 有 |
| 生理数据 | 心率、HRV、睡眠、地点，按时间贴到对话 | 心率贴到你本人说话的片段（像是免费，未确认） | 未提 | 心率、HRV 显示在时间线 | 写了同步 Apple Health，细节不明 |
| 给别的程序拿数据 | ZIP 导出；Mac 同网 Skill | MCP（读云端的小时笔记、回顾、健康样本，需账号，实际可能要 Pro）；未见文件导出 | 未见 | 未见 | webhook、MCP、开源，最好接 |

判断：手表全天录音这一档里，Auday 的一次性 10 美元是最便宜的付费方案，其余都是年费 30–50 美元。完全免费能录能转写的是 Memova 免费版，但没找到文件导出，数据进 Glimmer 要靠它需账号的 MCP，且可读的内容主要是 Pro 生成的笔记。

## 待验证（需实机）

- Memova 免费版：转写文本能否导出或被 MCP 读到；心率对齐是否免费。

- Auday 全天录音的真实续航，手表离开手机时能否继续录。
- Auday Skill 的数据格式，以及 agent 能否定时自动拉取（目前需要 iPhone 上连接页面开着）。

## 来源

- https://apps.apple.com/us/app/auday-all-day-watch-recorder/id6814210373
- https://auday.ai/
- https://fpfounderpark.substack.com/p/an-ai-app-that-turns-your-apple-watch
- https://www.macrumors.com/2026/11/03/watchos-27-3-audio-intelligence/
- https://flecty.app/
- https://docs.omi.me/doc/developer/apps/Introduction
- https://apps.apple.com/app/id1115567069
