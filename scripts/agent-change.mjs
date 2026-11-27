#!/usr/bin/env node
// Claude 改 Glimmer 数据用的命令。它只读数据文件、往收件箱里放改动单；
// 真正的修改由桌面版 Glimmer 核对后执行（规则见 src/utils/agentChanges.ts）。
//
//   node scripts/agent-change.mjs read [文档 id]
//       打印这篇的标题、版本号（正文的 SHA-256）和正文 HTML。不给 id 时读「长期任务」。
//   node scripts/agent-change.mjs submit --base <版本号> --markdown-file <文件> --summary "<一句话>" [--diary <id>]
//       放一张改动单，然后最多等 60 秒，打印 Glimmer 的处理结果。
//       把正文恢复成某一版原样时，用 --html-file 代替 --markdown-file（比如从 done/ 里取出的 previousContent）。
//   node scripts/agent-change.mjs plan --day <YYYY-MM-DD> --items-file <文件> --summary "<一句话>"
//       往那天日记的「今日计划」最前面加几条待办（文件里一行一条）。那天的日记还没建时单子留在收件箱，
//       他建好、且没开着那篇时执行；过了那天作废。放下单子就返回，不等结果，之后用 status 查。
//   node scripts/agent-change.mjs status <改动单 id>
//       查一张单子的处理结果。
//
// 数据文件里有登录凭证，这个脚本只取日记那一项，不打印别的。

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP_DIR = join(homedir(), 'Library/Application Support/com.yuchao.glimmer');
const STORE = join(APP_DIR, 'glimmer-store.json');
const INBOX = join(APP_DIR, 'agent-inbox');
const LONG_TERM_MASTER_ID = '00000000-0000-4000-a000-000000000001';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const readDiaries = () => {
  const store = JSON.parse(readFileSync(STORE, 'utf8'));
  const uid = store.glimmer_last_user_id;
  const raw = store[`diaries-${uid}`];
  if (!raw) fail('数据文件里没有当前账号的日记。');
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
};

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const readResult = (changeId) => {
  const file = join(INBOX, 'done', `${changeId}.json`);
  if (!existsSync(file)) return null;
  const { outcome } = JSON.parse(readFileSync(file, 'utf8'));
  return { result: outcome.result, reason: outcome.reason, at: outcome.at };
};

const command = args[0];

if (command === 'read') {
  const id = args[1] && !args[1].startsWith('--') ? args[1] : LONG_TERM_MASTER_ID;
  const diary = readDiaries().find((item) => item.id === id);
  if (!diary) fail(`找不到文档 ${id}`);
  const base = createHash('sha256').update(diary.content, 'utf8').digest('hex');
  console.log(JSON.stringify({ id: diary.id, title: diary.title, base }));
  // 正文后面不加换行：存成文件再用 --html-file 交回去时，要和原文一字不差。
  process.stdout.write(diary.content);
} else if (command === 'submit') {
  const base = flag('base');
  const markdownFile = flag('markdown-file');
  const htmlFile = flag('html-file');
  const summary = flag('summary');
  if (!base || !summary || Boolean(markdownFile) === Boolean(htmlFile)) {
    fail('用法：submit --base <版本号> (--markdown-file <文件> | --html-file <文件>) --summary "<一句话>" [--diary <id>]');
  }
  const changeId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const change = {
    id: changeId,
    kind: 'replace_content',
    diaryId: flag('diary') ?? LONG_TERM_MASTER_ID,
    baseContentHash: base,
    ...(markdownFile ? { markdown: readFileSync(markdownFile, 'utf8') } : { html: readFileSync(htmlFile, 'utf8') }),
    summary,
    createdAt: Date.now(),
  };
  mkdirSync(INBOX, { recursive: true });
  // 先写临时文件再改名，Glimmer 不会读到写了一半的单子。
  const temp = join(INBOX, `${changeId}.json.tmp`);
  writeFileSync(temp, JSON.stringify(change, null, 2));
  renameSync(temp, join(INBOX, `${changeId}.json`));
  console.log(`已放入改动单 ${changeId}，等 Glimmer 处理……`);

  const deadline = Date.now() + 60_000;
  const poll = () => {
    const result = readResult(changeId);
    if (result) {
      console.log(JSON.stringify(result));
      process.exit(result.result === 'applied' ? 0 : 2);
    }
    if (Date.now() > deadline) {
      console.log('60 秒内没处理：桌面版可能没开，或这篇正开着（切到别的日记后会执行）。之后用 status 查。');
      process.exit(3);
    }
    setTimeout(poll, 1000);
  };
  poll();
} else if (command === 'plan') {
  const day = flag('day');
  const itemsFile = flag('items-file');
  const summary = flag('summary');
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !itemsFile || !summary) {
    fail('用法：plan --day <YYYY-MM-DD> --items-file <文件> --summary "<一句话>"');
  }
  const items = readFileSync(itemsFile, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
  if (items.length === 0) fail('条目文件是空的');
  const changeId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  mkdirSync(INBOX, { recursive: true });
  const temp = join(INBOX, `${changeId}.json.tmp`);
  writeFileSync(temp, JSON.stringify({ id: changeId, kind: 'add_today_plan', day, items, summary, createdAt: Date.now() }, null, 2));
  renameSync(temp, join(INBOX, `${changeId}.json`));
  console.log(`已放入计划单 ${changeId}（${items.length} 条，${day}）。那天的日记建好、没开着时执行。`);
} else if (command === 'status') {
  if (!args[1]) fail('用法：status <改动单 id>');
  const result = readResult(args[1]);
  console.log(result ? JSON.stringify(result) : existsSync(join(INBOX, `${args[1]}.json`)) ? '还在收件箱里，没处理' : '找不到这张单子');
} else {
  fail('用法见文件开头的注释：read / submit / plan / status');
}
