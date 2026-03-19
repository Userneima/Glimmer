import React, { useState } from 'react';
import { Modal } from './Modal';
import type { Diary, Folder } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../../i18n';
import { storage } from '../../utils/storage';
import { ModalFooter } from './ModalFooter';
import { showToast } from '../../utils/toast';
import { Button } from './Button';

type BackupItem = { timestamp: number; diaries: Diary[]; folders: Folder[] };
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
type PdfJsModule = { getDocument: (input: { data: ArrayBuffer }) => { promise: Promise<PdfDocumentLike> } };

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportDiaries: (diaries: Diary[], options?: { replace?: boolean }) => void;
  onImportFolders: (folders: Folder[], options?: { replace?: boolean }) => void;
}

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

  const parseMarkdownToHtml = async (markdown: string) => {
    // Lightweight markdown to HTML (headers, bold, italic, inline code, lists, paragraphs)
    let md = String(markdown || '').replace(/\r\n/g, '\n');

    // Headings
    md = md.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
    md = md.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
    md = md.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    md = md.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    md = md.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    md = md.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold and italic
    md = md.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    md = md.replace(/\*(.*?)\*/gim, '<em>$1</em>');

    // Inline code
    md = md.replace(/`([^`]+)`/gim, '<code>$1</code>');

    // Lists (basic)
    md = md.replace(/(^|\n)\s*[-*+] (.+)/gim, '$1<li>$2</li>');
    md = md.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');

    // Paragraphs split by double newlines
    const parts = md.split('\n\n').map(p => p.trim()).filter(Boolean);
    const html = parts.map(p => {
      if (/^<h\d/.test(p) || /^<ul/.test(p) || /^<pre/.test(p)) return p;
      return `<p>${p.replace(/\n/g, '<br/>')}</p>`;
    }).join('');

    return html;
  };

  const parseDocx = async (arrayBuffer: ArrayBuffer) => {
    try {
      // Use dynamic variable import to avoid Vite static resolution when package is not installed
      const pkg = 'mammoth';
      const mammoth = await import(/* @vite-ignore */ pkg) as unknown as MammothModule;
      const res = await mammoth.convertToHtml({ arrayBuffer });
      return res.value;
    } catch (err) {
      console.warn('mammoth not available or parse failed', err);
      return null;
    }
  };

  const parsePdf = async (arrayBuffer: ArrayBuffer) => {
    try {
      const pkg = 'pdfjs-dist/build/pdf';
      const pdfjsLib = await import(/* @vite-ignore */ pkg) as unknown as PdfJsModule;
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item) => item.str ?? '');
        fullText += strings.join(' ') + '\n\n';
      }
      // Simple paragraphs
      return fullText.split('\n\n').map(p => `<p>${p}</p>`).join('');
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

  const parseFile = async (file: File): Promise<{ diaries?: Diary[]; folders?: Folder[] } | null> => {
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
          // full data object with diaries/folders
          const p = parsed;
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
        const text = await readAsText(file);
        const html = await parseMarkdownToHtml(text);
        // title from first heading
        const match = text.match(/^#\s+(.+)/m);
        const title = match ? match[1].trim() : file.name.replace(/\.md$/i, '');
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

      if (type === 'html') {
        const text = await readAsText(file);
        // try to extract title
        const titleMatch = text.match(/<title>(.*?)<\/title>/i) || text.match(/<h1>(.*?)<\/h1>/i);
        const title = titleMatch ? titleMatch[1] : file.name.replace(/\.html?$/i, '');
        const diary: Diary = {
          id: uuidv4(),
          title,
          content: text,
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
        return { diaries: [{
          id: uuidv4(),
          title: file.name.replace(/\.docx$/i, ''),
          content: `<p>${t('Unable to parse .docx file content')}</p>`,
          folderId: null,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }] };
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
        return { diaries: [{
          id: uuidv4(),
          title: file.name.replace(/\.pdf$/i, ''),
          content: `<p>${t('Unable to parse PDF file content')}</p>`,
          folderId: null,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }] };
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
      if (allDiaries.length === 0 && allFolders.length === 0) {
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
                    <div className="text-xs text-gray-500">{(b.diaries?.length || 0)} {t('Diaries')}, {(b.folders?.length || 0)} {t('Folders')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        const ok = window.confirm(t('This will replace existing data. Are you sure?'));
                        if (!ok) return;
                        onImportFolders(b.folders || [], { replace: true });
                        onImportDiaries(b.diaries || [], { replace: true });
                        showToast(t('Imported successfully'), 'success');
                        onClose();
                        reset();
                      }}
                    >{t('Restore backup')}</Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify({ diaries: b.diaries || [], folders: b.folders || [] }, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `backup_${b.timestamp}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
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
