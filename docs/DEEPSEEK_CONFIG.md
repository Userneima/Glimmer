# DeepSeek API 配置指南

## 配置步骤

### 1. 获取 DeepSeek API Key

1. 访问 DeepSeek 平台：https://platform.deepseek.com/
2. 注册/登录账号
3. 进入 API Keys 页面：https://platform.deepseek.com/api_keys
4. 创建新的 API Key 并复制

### 2. 配置环境变量

打开项目根目录下的 `.env` 文件，将你的 API Key 填入：

```env
VITE_DEEPSEEK_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**注意**：
- `.env` 文件已添加到 `.gitignore`，不会被提交到 git
- 请妥善保管你的 API Key，不要分享给他人

### 3. 可选配置

如果需要自定义配置，可以修改以下参数：

```env
# 使用推理模型（更强大但更慢）
VITE_DEEPSEEK_MODEL=deepseek-reasoner

# 自定义 API 端点（如使用代理）
VITE_DEEPSEEK_BASE_URL=https://your-proxy.com
```

### 4. 测试配置

在项目根目录运行测试脚本：

```bash
# Windows PowerShell
$env:DS_KEY="your_api_key_here"; $env:DIARY_TEXT="今天天气很好，心情不错"; node scripts/test_deepseek.js

# Windows CMD
set DS_KEY=your_api_key_here && set DIARY_TEXT=今天天气很好，心情不错 && node scripts/test_deepseek.js

# Linux/Mac
DS_KEY="your_api_key_here" DIARY_TEXT="今天天气很好，心情不错" node scripts/test_deepseek.js
```

如果配置正确，你应该看到类似以下的 JSON 响应：

```json
{
  "summary": "今天心情愉悦...",
  "suggestions": ["建议1", "建议2"],
  "tags": ["心情", "天气"]
}
```

### 5. 启动应用

```bash
npm run dev
```

应用启动后：
1. 点击右上角的设置图标
2. 进入 "AI Settings"
3. 确认 DeepSeek 配置已生效（如果使用环境变量，会显示提示信息）
4. 创建或编辑日记，点击 "AI 分析" 按钮测试功能

## 功能说明

### AI 分析功能

应用会按以下优先级使用 AI 服务：

1. **DeepSeek API**（优先）- 如果配置了环境变量或在设置中填写了 API Key
2. **Gemini API**（备选）- 如果 DeepSeek 不可用且配置了 Gemini Key
3. **本地启发式分析**（兜底）- 如果没有配置任何 API Key

### 模型选择

- **deepseek-chat**：标准对话模型，速度快，适合日常使用
- **deepseek-reasoner**：推理模型，分析更深入，但速度较慢，适合复杂内容

## 故障排查

### 问题：API 调用失败

1. 检查 API Key 是否正确
2. 确认账户余额是否充足
3. 检查网络连接
4. 查看浏览器控制台的错误信息

### 问题：环境变量不生效

1. 确保 `.env` 文件在项目根目录
2. 重启开发服务器（`npm run dev`）
3. 确认变量名以 `VITE_` 开头（Vite 要求）

### 问题：中文乱码

DeepSeek API 原生支持中文，不应出现乱码。如果出现问题：
1. 检查请求头是否包含 `Content-Type: application/json`
2. 确认响应编码为 UTF-8

## 安全建议

1. **不要**将 `.env` 文件提交到 git
2. **不要**在前端代码中硬编码 API Key
3. **不要**将 API Key 分享给他人
4. 定期轮换 API Key
5. 为生产环境使用单独的 API Key

## 成本控制

DeepSeek API 按 token 计费：
- 输入：约 ¥0.001/1K tokens
- 输出：约 ¥0.002/1K tokens

建议：
- 使用 `deepseek-chat` 而非 `deepseek-reasoner` 以降低成本
- 限制单次分析的文本长度
- 在设置中调整 `max_tokens` 参数

## 更多信息

- DeepSeek 官方文档：https://platform.deepseek.com/docs
- API 参考：https://platform.deepseek.com/api-docs
- 定价信息：https://platform.deepseek.com/pricing
