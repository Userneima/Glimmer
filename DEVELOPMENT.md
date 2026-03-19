# 日记应用开发指南

## 📁 项目位置
```
C:\Users\lenovo\Desktop\diary-app
```

## 🚀 快速启动

### 启动开发服务器
```bash
cd C:\Users\lenovo\Desktop\diary-app
npm run dev
```
访问：http://localhost:5173 (或其他可用端口)

### 停止服务器
在终端按 `Ctrl+C`

### 构建生产版本
```bash
npm run build
```

### 预览生产版本
```bash
npm run preview
```

## 📦 项目结构

```
diary-app/
├── src/
│   ├── components/
│   │   ├── Editor/
│   │   │   ├── Editor.tsx              # TipTap富文本编辑器
│   │   │   └── EditorToolbar.tsx       # 编辑器工具栏
│   │   ├── Sidebar/
│   │   │   ├── FolderTree.tsx          # 文件夹树
│   │   │   ├── TagPanel.tsx            # 标签面板
│   │   │   ├── CalendarView.tsx        # 日历视图
│   │   │   └── DiaryList.tsx           # 日记列表
│   │   ├── Layout/
│   │   │   └── AppLayout.tsx           # 主应用布局
│   │   └── UI/
│   │       ├── Button.tsx              # 按钮组件
│   │       ├── Input.tsx               # 输入框组件
│   │       ├── Modal.tsx               # 模态框组件
│   │       ├── TagInput.tsx            # 标签输入组件
│   │       └── ExportModal.tsx         # 导出功能模态框
│   ├── hooks/
│   │   ├── useDiaries.ts               # 日记数据管理
│   │   └── useFolders.ts               # 文件夹管理
│   ├── types/
│   │   └── index.ts                    # TypeScript类型定义
│   ├── utils/
│   │   ├── storage.ts                  # localStorage封装
│   │   └── date.ts                     # 日期格式化工具
│   ├── App.tsx                         # 主应用组件
│   ├── main.tsx                        # 入口文件
│   └── index.css                       # 全局样式
├── package.json                        # 依赖配置
├── tsconfig.json                       # TypeScript配置
├── vite.config.ts                      # Vite配置
├── tailwind.config.js                  # Tailwind CSS配置
└── README.md                           # 项目说明
```

## 🛠️ 技术栈

### 核心框架
- **React 18** - UI框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具

### UI和样式
- **Tailwind CSS** - 样式框架
- **Lucide React** - 图标库
- **React Calendar** - 日历组件

### 编辑器
- **TipTap** - 富文本编辑器
  - @tiptap/react
  - @tiptap/starter-kit
  - @tiptap/extension-* (各种扩展)

### 导出功能
- **docx** - Word文档生成
- **jspdf** - PDF生成
- **html2canvas** - HTML转图片
- **file-saver** - 文件下载

### 工具库
- **date-fns** - 日期处理
- **uuid** - 唯一ID生成

## 🔧 常见开发任务

### 1. 添加新功能

#### 添加新的UI组件
```bash
# 在 src/components/UI/ 创建新组件
# 例如：src/components/UI/NewComponent.tsx
```

#### 添加新的视图
```bash
# 在 src/components/Sidebar/ 或其他位置创建
# 然后在 AppLayout.tsx 中集成
```

### 2. 修改样式

#### 全局样式
编辑 `src/index.css`

#### Tailwind配置
编辑 `tailwind.config.js`

#### 组件样式
直接在组件中使用Tailwind类名

### 3. 修改数据结构

#### 修改类型定义
编辑 `src/types/index.ts`

#### 修改存储逻辑
编辑 `src/utils/storage.ts`

### 4. 添加新的导出格式

编辑 `src/components/UI/ExportModal.tsx`
- 添加新的格式选项
- 实现转换函数
- 添加下载逻辑

### 5. 启用云端同步（Supabase）

1. 在 Supabase 创建项目并获取项目 URL 与 anon key。
2. 在 `.env` 中配置：

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

3. 在 Supabase 创建数据表（diaries / folders / tasks），并启用 RLS（按 user_id 过滤）。
4. 启动项目后，登录即可开启云端同步。

示例 SQL（可在 Supabase SQL Editor 执行）：

```sql
create table if not exists diaries (
  id uuid primary key,
  user_id uuid not null,
  title text not null,
  content text not null,
  folder_id uuid,
  tags text[],
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists folders (
  id uuid primary key,
  user_id uuid not null,
  name text not null,
  parent_id uuid,
  color text,
  created_at bigint not null
);

create table if not exists tasks (
  id uuid primary key,
  user_id uuid not null,
  title text not null,
  notes text,
  created_at bigint not null,
  due_at bigint,
  completed boolean not null default false,
  recurring text,
  related_diary_id uuid,
  task_type text not null,
  start_date bigint,
  end_date bigint,
  completed_at bigint,
  sort_order integer
);

alter table diaries enable row level security;
alter table folders enable row level security;
alter table tasks enable row level security;

create policy "diaries_owner" on diaries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "folders_owner" on folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tasks_owner" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## 📝 已实现功能清单

### ✅ 核心功能
- [x] 富文本编辑器（完整格式化支持）
- [x] 文件夹管理（创建、重命名、删除）
- [x] 日记管理（创建、编辑、删除）
- [x] 本地存储（localStorage）
- [x] 全文搜索
- [x] 自动保存
- [x] 字数统计

### ✅ 标签系统
- [x] 标签添加/删除
- [x] 标签筛选（多选）
- [x] 标签统计
- [x] 标签重命名
- [x] 标签合并
- [x] 标签颜色自定义

### ✅ 导出功能
- [x] Markdown导出
- [x] HTML导出
- [x] JSON导出
- [x] Word (.docx)导出
- [x] PDF导出（支持中文）

### ✅ 视图模式
- [x] 文件夹视图
- [x] 标签视图
- [x] 日历视图

## 🎯 未来可以添加的功能

### 短期优化
- [ ] 快捷键支持（Ctrl+N, Ctrl+S等）
- [ ] 夜间模式
- [ ] 拖拽日记到文件夹
- [ ] 日记模板功能
- [ ] 数据备份/恢复
- [ ] 导入功能（从Markdown导入）

### 中期功能
- [ ] 版本历史
- [ ] 图片压缩优化
- [ ] 多种视图模式（网格、时间轴）
- [ ] 高级搜索（日期范围、组合条件）
- [ ] 统计分析（写作习惯、字数趋势）

### 长期规划
- [ ] 云端同步
- [ ] 用户账号系统
- [ ] AI写作助手
- [ ] 移动端适配
- [ ] PWA支持
- [ ] 协作功能

## 🐛 调试技巧

### 查看浏览器控制台
按 `F12` 打开开发者工具，查看：
- Console：JavaScript错误
- Network：网络请求
- Application > Local Storage：查看存储的数据

### 清除本地数据
```javascript
// 在浏览器控制台执行
localStorage.clear()
// 然后刷新页面
```

### 查看存储的数据
```javascript
// 在浏览器控制台执行
console.log(JSON.parse(localStorage.getItem('diaries')))
console.log(JSON.parse(localStorage.getItem('folders')))
```

## 📚 重要文件说明

### src/hooks/useDiaries.ts
管理所有日记相关的状态和操作：
- `createDiary()` - 创建新日记
- `updateDiary()` - 更新日记
- `deleteDiary()` - 删除日记
- `searchDiaries()` - 搜索日记

### src/utils/storage.ts
封装localStorage操作：
- `getDiaries()` - 获取所有日记
- `saveDiaries()` - 保存日记
- `getFolders()` - 获取所有文件夹
- `saveFolders()` - 保存文件夹

### src/components/Layout/AppLayout.tsx
主应用布局，协调所有组件：
- 管理左侧面板切换（文件夹/标签/日历）
- 处理日记选择和编辑
- 管理导出功能

## 🔄 继续开发的步骤

### 1. 重新打开项目
```bash
# 打开终端（PowerShell或CMD）
cd C:\Users\lenovo\Desktop\diary-app

# 启动开发服务器
npm run dev
```

### 2. 使用Claude Code继续开发
```bash
# 在项目目录下启动Claude Code
claude-code
```

然后告诉Claude：
- "我想继续开发日记应用"
- "我想添加[具体功能]"
- "我想修改[具体部分]"

### 3. 常用命令
```bash
# 安装新依赖
npm install <package-name>

# 更新依赖
npm update

# 检查依赖问题
npm audit

# 格式化代码（如果配置了）
npm run format
```

## 💡 开发建议

### 代码规范
- 使用TypeScript类型定义
- 组件使用函数式组件 + Hooks
- 使用Tailwind CSS类名而不是内联样式
- 保持组件单一职责

### 性能优化
- 使用 `React.memo` 优化组件渲染
- 使用 `useCallback` 和 `useMemo` 缓存函数和值
- 大列表考虑虚拟滚动

### 数据管理
- localStorage有5MB限制
- 图片使用base64存储会占用大量空间
- 考虑定期清理或压缩数据

## 📞 获取帮助

### 文档资源
- React: https://react.dev
- TypeScript: https://www.typescriptlang.org
- Tailwind CSS: https://tailwindcss.com
- TipTap: https://tiptap.dev
- Vite: https://vitejs.dev

### 常见问题

**Q: 端口被占用怎么办？**
A: Vite会自动尝试其他端口（5174, 5175等）

**Q: 修改代码后没有更新？**
A: 按 `Ctrl+Shift+R` 强制刷新浏览器

**Q: 依赖安装失败？**
A: 删除 `node_modules` 和 `package-lock.json`，重新运行 `npm install`

**Q: TypeScript报错？**
A: 检查类型定义，确保导入正确

## 🎉 项目亮点

- ✨ 完整的富文本编辑功能
- 🏷️ 强大的标签系统
- 📅 直观的日历视图
- 📤 多格式导出（支持中文）
- 💾 本地存储，隐私安全
- 🎨 简约现代的UI设计
- ⚡ 快速响应，流畅体验

---

**祝您开发愉快！** 🚀

如有问题，随时使用Claude Code寻求帮助。
