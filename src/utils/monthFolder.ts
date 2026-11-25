import type { Folder } from '../types';

// 他的文件夹按月份分，名字是 2026-09 这种形式。新建日记直接放进当月文件夹，
// 不看当时左侧选中的是哪个：选中「所有日记」时新建，日记会不属于任何文件夹，
// 之后在月份文件夹里就找不到它了。
const MONTH_FOLDER_RE = /^\d{4}-\d{2}$/;

export const isMonthFolder = (folder: Folder) => MONTH_FOLDER_RE.test(folder.name.trim());

export const monthFolderName = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export type MonthFolderPlan =
  | { kind: 'existing'; folderId: string }
  | { kind: 'create'; name: string; parentId: string | null }
  | { kind: 'none' };

// 从没建过月份文件夹就不接管，照旧用当时选中的文件夹。
// 当月文件夹还没有（比如每月 1 号）就新建一个，放在最近那个月份文件夹的同一层。
export const planMonthFolder = (folders: Folder[], timestamp: number): MonthFolderPlan => {
  const monthFolders = folders.filter(isMonthFolder);
  if (monthFolders.length === 0) return { kind: 'none' };

  const name = monthFolderName(timestamp);
  const existing = monthFolders.find((folder) => folder.name.trim() === name);
  if (existing) return { kind: 'existing', folderId: existing.id };

  const latest = [...monthFolders].sort((a, b) => b.name.localeCompare(a.name))[0];
  return { kind: 'create', name, parentId: latest.parentId };
};
