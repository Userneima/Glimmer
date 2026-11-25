import React, { useState } from 'react';
import { Modal } from './Modal';
import type { Diary, Folder } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../../i18n';
import { storage, type Backup } from '../../utils/storage';
import { flushDesktopStore } from '../../utils/desktopStore';
import { sanitizeDiaryHtml } from '../../utils/export';
import { downloadFile } from '../../utils/fileSave';
import { ModalFooter } from './ModalFooter';
import { showToast } from '../../utils/toast';
import { Button } from './Button';
import { markdownToHtml } from '../../utils/markdown';

type BackupItem = Backup;
type JsonRecord = Record<string, unknown>;

const isJsonRecord = (value: unknown): value is JsonRecord => {
  return typeof value === 'object' && value !== null;
};

const toDiary = (value: unknown, fallbackTitle: string): Diary => {
  const record = isJsonRecord(value) ? value : {};
  return {
    id: typeof record.id === 'string' && record.id ? record.id : uuidv4(),
    title: typeof record.title === 'string' && record.title ? record.title : fallbackTitle,
    content: typeof record.content === 'string' ? record.content : '',
    folderId: typeof record.folderId === 'string' ? record.folderId : null,
    tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
  };
};

const toFolder = (value: unknown): Folder => {
  const record = isJsonRecord(value) ? value : {};
  return {
    id: typeof record.id === 'string' && record.id ? record.id : uuidv4(),
    name: typeof record.name === 'string' && record.name ? record.name : 'Folder',
    parentId: typeof record.parentId === 'string' ? record.parentId : null,
    color: typeof record.color === 'string' ? record.color : undefined,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
  };
};

type MammothModule = {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
};

type PdfTextItem = { str?: string };
type PdfPageLike = { getTextContent: () => Promise<{ items: PdfTextItem[] }> };
type PdfDocumentLike = { numPages: number; getPage: (pageNumber: number) => Promise<PdfPageLike> };
type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (input: { data: ArrayBuffer }) => { promise: Promise<PdfDocumentLike> };
};

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportDiaries: (diaries: Diary[], options?: { replace?: boolean }) => void;
  onImportFolders: (folders: Folder[], options?: { replace?: boolean }) => void;
}

// Glimmer 导出时写的日期形如 2026/10/07，读回成那天的时间戳。
const parseExportDate = (value: string): number | null => {
  const match = value.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportDiaries,
  onImportFolders,
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<Record<string, string>>({});
  const [backups] = useState<BackupItem[]>(() => storage.getBackups());

  const reset = () => {
    setFiles([]);
    setFileStatuses({});
    setReplaceExisting(false);
  };

  const detectType = (name: string) => {
    const n = name.toLowerCase();
    if (n.endsWith('.json')) return 'json';
    if (n.endsWith('.md') || n.endsWith('.markdown')) return 'markdown';
    if (n.endsWith('.html') || n.endsWith('.htm')) return 'html';
    if (n.endsWith('.txt')) return 'txt';
    if (n.endsWith('.docx')) return 'docx';
    if (n.endsWith('.pdf')) return 'pdf';
    return 'unknown';
  };

  const readAsText = (file: File) => new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsText(file);
  });

  const readAsArrayBuffer = (file: File) => new Promise<ArrayBuffer>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });

  const parseMarkdownToHtml = async (markdown: string) => markdownToHtml(markdown);

  const parseDocx = async (arrayBuffer: ArrayBuffer) => {
    try {
      // 用到时才加载，但路径要写死，打包工具才会把它打进去；拼成变量的话打包后找不到。
      const mammoth = await import('mammoth') as unknown as MammothModule;
      const res = await mammoth.convertToHtml({ arrayBuffer });
      return res.value;
    } catch (err) {
      console.warn('mammoth not available or parse failed', err);
      return null;
    }
  };

  const parsePdf = async (arrayBuffer: ArrayBuffer) => {
    try {
      const pdfjsLib = await import('pdfjs-dist') as unknown as PdfJsModule;
      // pdf.js 在单独的后台线程里解析，要告诉它那个线程的脚本在哪。
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item) => item.str ?? '');
        fullText += strings.join(' ') + '\n\n';
      }
      // Simple paragraphs
      // 文字要转义，不然「a<b」这类内容会被当成标签吃掉。
      const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return fullText.split('\n\n').filter((p) => p.trim()).map((p) => `<p>${escape(p.trim())}</p>`).join('');
    } catch (err) {
      console.warn('pdf parsing failed', err);
      return null;
    }
  };

  const handleFilesSelected = (fList: FileList | null) => {
    if (!fList) return;
    const arr = Array.from(fList);
    setFiles(arr);
    const statuses: Record<string, string> = {};
    arr.forEach(f => statuses[f.name] = t('Ready'));
    setFileStatuses(statuses);
  };

  const parseFile = async (file: File): Promise<{ diaries?: Diary[]; folders?: Folder[]; fullData?: unknown } | null> => {
    const type = detectType(file.name);
    try {
      if (type === 'json') {
        const text = await readAsText(file);
        const parsed: unknown = JSON.parse(text);
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) return { diaries: [] };
          const first = parsed[0];
          if (isJsonRecord(first) && (first.content !== undefined || first.title !== undefined)) {
            // diaries
            const diaries = parsed.map((d) => toDiary(d, file.name.replace(/\.json$/i, '')));
            return { diaries };
          }
          if (isJsonRecord(first) && (first.name !== undefined || first.parentId !== undefined)) {
            const folders = parsed.map((f) => toFolder(f));
            return { folders };
          }
          // Unknown array, try treat as diaries
          const diaries = parsed.map((d) => {
            const diary = toDiary(d, file.name.replace(/\.json$/i, ''));
            if (diary.content) {
              return diary;
            }
            return {
              ...diary,
              content: JSON.stringify(d, null, 2),
            };
          });
          return { diaries };
        } else if (isJsonRecord(parsed)) {
          // full data object with diaries/folders。桌面自动备份把数据包在 data 里一层。
          const p = isJsonRecord(parsed.data) && Array.isArray(parsed.data.diaries) ? parsed.data : parsed;
          const hasFullBackupData =
            Array.isArray(p.tasks) ||
            Array.isArray(p.tags) ||
            p.diaryTagColors !== undefined;

          if (hasFullBackupData) {
            return { fullData: p };
          }

          if ((Array.isArray(p.diaries) || Array.isArray(p.folders)) && (p.diaries || p.folders)) {
            const diaries = Array.isArray(p.diaries)
              ? p.diaries.map((d) => toDiary(d, 'Untitled'))
              : [];

            const folders = Array.isArray(p.folders)
              ? p.folders.map((f) => toFolder(f))
              : [];

            return { diaries, folders };
          }

          // single diary or folder
          if (p && (p.content !== undefined || p.title !== undefined)) {
            const d: Diary = toDiary(p, file.name.replace(/\.json$/i, ''));
            return { diaries: [d] };
          }
          if (p && (p.name !== undefined || p.parentId !== undefined)) {
            const fo: Folder = toFolder(p);
            return { folders: [fo] };
          }
        }
        return null;
      }

      if (type === 'markdown') {
        const text = (await readAsText(file)).replace(/\r\n/g, '\n');
        // Glimmer 自己导出的 Markdown 每篇开头是「# 标题、Date: 日期、---」，全部合成一个文件时
        // 篇与篇之间用 --- 隔开。认出来就拆回一篇一篇，标题和日期放回原位，不留在正文里。
        const chunks = text.split(/\n\n---\n\n(?=# [^\n]+\n\nDate: )/);
        const diaries: Diary[] = await Promise.all(chunks.map(async (chunk) => {
          const own = chunk.match(/^# ([^\n]+)\n\nDate: ([^\n]+)\n\n---\n\n?/);
          const body = own ? chunk.slice(own[0].length) : chunk;
          const firstHeading = chunk.match(/^#\s+(.+)/m);
          const title = own ? own[1].trim() : firstHeading ? firstHeading[1].trim() : file.name.replace(/\.(md|markdown)$/i, '');
          const createdAt = own ? parseExportDate(own[2]) ?? Date.now() : Date.now();
          return {
            id: uuidv4(),
            title,
            content: await parseMarkdownToHtml(body),
            folderId: null,
            tags: [],
            createdAt,
            updatedAt: Date.now(),
          };
        }));
        return { diaries };
      }

      if (type === 'html') {
        const text = await readAsText(file);
        const doc = new DOMParser().parseFromString(text, 'text/html');
        // Glimmer 自己导出的 HTML：每篇是一个 article.diary-entry，标题、日期、正文分开放着。
        const entries = Array.from(doc.querySelectorAll('article.diary-entry'));
        if (entries.length > 0) {
          const diaries: Diary[] = entries.map((entry) => ({
            id: uuidv4(),
            title: entry.querySelector('h1')?.textContent?.trim() || file.name.replace(/\.html?$/i, ''),
            content: sanitizeDiaryHtml(entry.querySelector('.content')?.innerHTML ?? ''),
            folderId: null,
            tags: [],
            createdAt: parseExportDate(entry.querySelector('.meta')?.textContent?.replace(/^Created:\s*/, '') ?? '') ?? Date.now(),
            updatedAt: Date.now(),
          }));
          return { diaries };
        }
        // 其它 HTML 只取 body 里的内容，去掉脚本、样式这类东西；标题取 <title> 的文字（实体字符会被还原）。
        const title = doc.title.trim() || doc.querySelector('h1')?.textContent?.trim() || file.name.replace(/\.html?$/i, '');
        const diary: Diary = {
          id: uuidv4(),
          title,
          content: sanitizeDiaryHtml(doc.body?.innerHTML ?? ''),
          folderId: null,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return { diaries: [diary] };
      }

      if (type === 'txt') {
        const text = await readAsText(file);
        const diary: Diary = {
          id: uuidv4(),
          title: file.name.replace(/\.txt$/i, ''),
          content: `<pre>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
          folderId: null,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return { diaries: [diary] };
      }

      if (type === 'docx') {
        const arrayBuffer = await readAsArrayBuffer(file);
        const html = await parseDocx(arrayBuffer);
        if (html !== null) {
          const titleMatch = html.match(/<h1>(.*?)<\/h1>/i);
          const title = titleMatch ? titleMatch[1] : file.name.replace(/\.docx$/i, '');
          const diary: Diary = {
            id: uuidv4(),
            title,
            content: html,
            folderId: null,
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          return { diaries: [diary] };
        }
        // 解析不了就算这份文件导入失败，不塞一篇「无法解析」的空日记再报成功。
        return null;
      }

      if (type === 'pdf') {
        const arrayBuffer = await readAsArrayBuffer(file);
        const html = await parsePdf(arrayBuffer);
        if (html !== null) {
          const diary: Diary = {
            id: uuidv4(),
            title: file.name.replace(/\.pdf$/i, ''),
            content: html,
            folderId: null,
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          return { diaries: [diary] };
        }
        return null;
      }

      return null;
    } catch (err) {
      console.error('parseFile failed', file.name, err);
      return null;
    }
  };

  const handleImport = async () => {
    if (files.length === 0) {
      showToast(t('请选择要导入的文件'), 'error');
      return;
    }
    setIsImporting(true);
    const allDiaries: Diary[] = [];
    const allFolders: Folder[] = [];
    const fullDataItems: unknown[] = [];
    const statuses: Record<string, string> = { ...fileStatuses };

    for (const f of files) {
      try {
        statuses[f.name] = t('Parsing...');
        setFileStatuses({ ...statuses });
        const res = await parseFile(f);
        if (!res) {
          statuses[f.name] = t('Unsupported or failed to parse');
          setFileStatuses({ ...statuses });
          continue;
        }
        if (res.diaries) {
          allDiaries.push(...res.diaries);
          statuses[f.name] = `${res.diaries.length} 条日记`;
        }
        if (res.folders) {
          allFolders.push(...res.folders);
          statuses[f.name] = `${res.folders.length} 个文件夹`;
        }
        if (res.fullData) {
          fullDataItems.push(res.fullData);
          statuses[f.name] = t('Backup data');
        }
        setFileStatuses({ ...statuses });
      } catch {
        statuses[f.name] = t('Error');
        setFileStatuses({ ...statuses });
      }
    }

    try {
      if (replaceExisting) {
        const ok = window.confirm(t('This will replace existing data. Are you sure?'));
        if (!ok) {
          setIsImporting(false);
          return;
        }
      }

      if (allFolders.length > 0) {
        onImportFolders(allFolders, { replace: replaceExisting });
      }
      if (allDiaries.length > 0) {
        onImportDiaries(allDiaries, { replace: replaceExisting });
      }
      fullDataItems.forEach((item) => {
        storage.importAllData(item, { replace: replaceExisting });
      });
      if (fullDataItems.length > 0) {
        // 桌面版的数据文件是稍后才写的，先等它写完再刷新，否则导入的内容会丢。
        await flushDesktopStore().catch(() => {});
        window.location.reload();
      }
      if (allDiaries.length === 0 && allFolders.length === 0 && fullDataItems.length === 0) {
        showToast(t('No importable data found'), 'error');
      } else {
        showToast(t('Imported successfully'), 'success');
        onClose();
        reset();
      }
    } catch (err) {
      console.error(err);
      showToast(t('Import failed. Please try again.'), 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Import Files')}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('Supported formats')}</label>
          <div className="text-sm text-gray-500">{t('Supported formats list')}</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('Files')}</label>
          <input
            type="file"
            multiple
            accept=".json,application/json,.md,.markdown,.html,.htm,.txt,.docx,.pdf"
            onChange={(e) => handleFilesSelected(e.target.files)}
            className="w-full"
          />
        </div>

        {files.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('Files to import')}</label>
            <div className="space-y-2 max-h-44 overflow-auto">
              {files.map(f => (
                <div key={f.name} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <div className="font-medium">{f.name}</div>
                    <div className="text-xs text-gray-500">{t(detectType(f.name).toUpperCase())}</div>
                  </div>
                  <div className="text-sm text-gray-600">{fileStatuses[f.name]}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4">
          <h3 className="text-sm font-medium text-gray-800 mb-2">{t('Backups')}</h3>
          {backups.length === 0 ? (
            <div className="text-sm text-gray-500">{t('No backups found')}</div>
          ) : (
            <div className="space-y-2 max-h-40 overflow-auto">
              {backups.slice().reverse().map(b => (
                <div key={b.timestamp} className="flex items-center justify-between p-2 border rounded">
                  <div className="text-sm">
                    <div className="font-medium">{t('Backup created at')} {new Date(b.timestamp).toLocaleString()}</div>
                    <div className="text-xs text-gray-500">
                      {(b.diaries?.length || 0)} {t('Diaries')}, {(b.folders?.length || 0)} {t('Folders')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        const ok = window.confirm(t('This will replace existing data. Are you sure?'));
                        if (!ok) return;
                        storage.restoreBackup(b.timestamp);
                        showToast(t('Imported successfully'), 'success');
                        onClose();
                        reset();
                        void flushDesktopStore().catch(() => {}).finally(() => window.location.reload());
                      }}
                    >{t('Restore backup')}</Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
                        downloadFile(`backup_${b.timestamp}.json`, blob)
                          .then(() => showToast(t('Export completed'), 'success'))
                          .catch(() => showToast(t('Export failed. Please try again.'), 'error'));
                      }}
                    >{t('Download backup')}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <ModalFooter
          primaryLabel={isImporting ? t('Importing...') : t('Import')}
          primaryOnClick={handleImport}
          primaryDisabled={isImporting}
          secondaryLabel={t('Cancel')}
          secondaryOnClick={() => { onClose(); reset(); }}
        />
      </div>
    </Modal>
  );
};
