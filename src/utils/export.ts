import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { Diary } from '../types';
import { formatDate } from './date';
import { isTauriRuntime } from './desktopStore';
import { downloadFile } from './fileSave';

export type ExportFormat = 'markdown' | 'html' | 'json' | 'docx' | 'pdf';
export type ExportFileMode = 'combined' | 'separate';

type ExportEntry = {
  filename: string;
  blob: Blob;
};

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
};

type FileSystemWritableFileStream = {
  write: (data: Blob | BufferSource | string) => Promise<void>;
  close: () => Promise<void>;
};

type FileSystemFileHandle = {
  createWritable: () => Promise<FileSystemWritableFileStream>;
};

type FileSystemDirectoryHandle = {
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandle>;
};

type FilePickerWindow = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

const EXPORT_FONT_FAMILY = '"Glimmer PuHuiTi", "Alibaba PuHuiTi 3.0", "Alibaba PuHuiTi 3", "AlibabaPuHuiTi_3_55_Regular", "PingFang SC", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

const WINDOWS_RESERVED_FILENAME_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

const MIME_TYPES: Record<ExportFormat, string> = {
  markdown: 'text/markdown',
  html: 'text/html',
  json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

const EXTENSIONS: Record<ExportFormat, string> = {
  markdown: 'md',
  html: 'html',
  json: 'json',
  docx: 'docx',
  pdf: 'pdf',
};

export const sanitizeFilename = (name: string) =>
  (name || 'untitled')
    .split('')
    .map((char) => (WINDOWS_RESERVED_FILENAME_CHARS.has(char) || char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'untitled';

// 用浏览器自己的解析器读正文，再逐个元素转成 Markdown。以前是用正则删标签，
// 勾选状态、图片、链接地址都跟着没了。
const parseBody = (html: string) =>
  new DOMParser().parseFromString(`<main>${html}</main>`, 'text/html').querySelector('main') as HTMLElement;

const inlineToMarkdown = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof HTMLElement)) return '';
  const inner = () => Array.from(node.childNodes).map(inlineToMarkdown).join('');
  switch (node.tagName.toLowerCase()) {
    case 'strong':
    case 'b':
      return `**${inner()}**`;
    case 'em':
    case 'i':
      return `*${inner()}*`;
    case 's':
    case 'del':
      return `~~${inner()}~~`;
    case 'code':
      return `\`${node.textContent ?? ''}\``;
    case 'a':
      return `[${inner()}](${node.getAttribute('href') ?? ''})`;
    case 'img':
      return `![${node.getAttribute('alt') ?? ''}](${node.getAttribute('src') ?? ''})`;
    case 'br':
      return '  \n';
    default:
      return inner();
  }
};

const listToMarkdown = (list: HTMLElement, depth: number): string => {
  const indent = '  '.repeat(depth);
  const isTaskList = list.getAttribute('data-type') === 'taskList';
  const ordered = list.tagName.toLowerCase() === 'ol';
  return Array.from(list.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === 'li')
    .map((item, index) => {
      const checked = item.getAttribute('data-checked') === 'true';
      const marker = isTaskList ? `- [${checked ? 'x' : ' '}] ` : ordered ? `${index + 1}. ` : '- ';
      const textParts: string[] = [];
      const nested: string[] = [];
      const collect = (node: Node) => {
        if (node instanceof HTMLElement) {
          const tag = node.tagName.toLowerCase();
          if (tag === 'ul' || tag === 'ol') {
            nested.push(listToMarkdown(node, depth + 1));
            return;
          }
          if (tag === 'label') return; // 勾选框本身，状态已经写进 [x]
          if (tag === 'div' || tag === 'p') {
            Array.from(node.childNodes).forEach(collect);
            return;
          }
        }
        textParts.push(inlineToMarkdown(node));
      };
      Array.from(item.childNodes).forEach(collect);
      const line = `${indent}${marker}${textParts.join('').trim()}`;
      return [line, ...nested].join('\n');
    })
    .join('\n');
};

const blockToMarkdown = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').trim();
  if (!(node instanceof HTMLElement)) return '';
  const tag = node.tagName.toLowerCase();
  const heading = tag.match(/^h([1-6])$/);
  if (heading) return `${'#'.repeat(Number(heading[1]))} ${inlineToMarkdown(node).trim()}`;
  switch (tag) {
    case 'p':
      return inlineToMarkdown(node).trim();
    case 'ul':
    case 'ol':
      return listToMarkdown(node, 0);
    case 'blockquote':
      return Array.from(node.childNodes).map(blockToMarkdown).filter(Boolean).join('\n\n')
        .split('\n').map((line) => `> ${line}`).join('\n');
    case 'pre':
      return `\`\`\`\n${node.textContent ?? ''}\n\`\`\``;
    case 'hr':
      return '---';
    case 'img':
      return inlineToMarkdown(node);
    case 'table':
      return Array.from(node.querySelectorAll('tr'))
        .map((row, index) => {
          const cells = Array.from(row.children).map((cell) => (cell.textContent ?? '').trim().replace(/\|/g, '\\|'));
          const line = `| ${cells.join(' | ')} |`;
          return index === 0 ? `${line}\n| ${cells.map(() => '---').join(' | ')} |` : line;
        })
        .join('\n');
    default:
      return Array.from(node.childNodes).map(blockToMarkdown).filter(Boolean).join('\n\n');
  }
};

export const htmlToMarkdown = (html: string) =>
  Array.from(parseBody(html).childNodes).map(blockToMarkdown).filter(Boolean).join('\n\n');

export const convertToMarkdown = (diary: Diary): string => {
  const date = formatDate(diary.createdAt);
  return `# ${diary.title}\n\nDate: ${date}\n\n---\n\n${htmlToMarkdown(diary.content)}`;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// 放进页面之前清理正文：去掉脚本、内嵌页面这类元素，以及 onclick 这类事件属性和
// javascript: 链接。正文可能来自导入的外部 HTML，不能原样插进应用自己的页面里。
const DANGEROUS_TAGS = 'script, iframe, object, embed, link, meta, style, base, form';
export const sanitizeDiaryHtml = (html: string) => {
  const body = parseBody(html);
  body.querySelectorAll(DANGEROUS_TAGS).forEach((node) => node.remove());
  body.querySelectorAll('*').forEach((node) => {
    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) node.removeAttribute(attr.name);
      else if ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:')) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return body.innerHTML;
};

const renderDiaryBodyHTML = (diary: Diary) => {
  const date = formatDate(diary.createdAt);

  return `
    <article class="diary-entry">
      <h1>${escapeHtml(diary.title)}</h1>
      <div class="meta">Created: ${date}</div>
      <div class="content">${sanitizeDiaryHtml(diary.content)}</div>
    </article>
  `;
};

export const convertToHTML = (diary: Diary): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(diary.title)}</title>
  <style>${getExportStyles()}</style>
</head>
<body>
  ${renderDiaryBodyHTML(diary)}
</body>
</html>`;

const getExportStyles = () => `
  @font-face {
    font-family: 'Glimmer PuHuiTi';
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src:
      local('AlibabaPuHuiTi_3_55_Regular'),
      local('Alibaba PuHuiTi 3 55 Regular'),
      local('Alibaba PuHuiTi 3.055 Regular');
  }
  @font-face {
    font-family: 'Glimmer PuHuiTi';
    font-style: normal;
    font-weight: 600;
    font-display: swap;
    src:
      local('AlibabaPuHuiTi_3_75_SemiBold'),
      local('Alibaba PuHuiTi 3 75 SemiBold'),
      local('Alibaba PuHuiTi 3.075 SemiBold');
  }
  @font-face {
    font-family: 'Glimmer PuHuiTi';
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src:
      local('AlibabaPuHuiTi_3_85_Bold'),
      local('Alibaba PuHuiTi 3 85 Bold'),
      local('Alibaba PuHuiTi 3.085 Bold');
  }
  body {
    font-family: ${EXPORT_FONT_FAMILY};
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    line-height: 1.6;
    color: #333;
    background: #fff;
  }
  .diary-entry + .diary-entry {
    margin-top: 3rem;
    padding-top: 3rem;
    border-top: 1px solid #e5e7eb;
  }
  h1 {
    color: #1a1a1a;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 0.5rem;
  }
  .meta {
    color: #6b7280;
    font-size: 0.875rem;
    margin: 1rem 0;
  }
  .content {
    margin-top: 2rem;
  }
  code {
    background: #f3f4f6;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: 'Courier New', monospace;
  }
  pre {
    background: #1f2937;
    color: #f9fafb;
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
  }
  blockquote {
    border-left: 3px solid #d1d5db;
    padding-left: 1rem;
    color: #6b7280;
    margin: 1rem 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1rem 0;
  }
  table td, table th {
    border: 1px solid #d1d5db;
    padding: 0.5rem;
  }
  table th {
    background: #f3f4f6;
    font-weight: 600;
  }
`;

const createCombinedHTML = (diaries: Diary[]) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>All Diaries</title>
  <style>${getExportStyles()}</style>
</head>
<body>
  ${diaries.map(renderDiaryBodyHTML).join('\n')}
</body>
</html>`;

// 把正文拆成一段一段：每个标题、段落、列表项、引用各成一段。以前是整篇取纯文字再按换行切，
// 相邻两个段落之间没有换行，就被拼成了一段。
type DocBlock = { text: string; heading?: 1 | 2 | 3; indent: number };

export const htmlToDocBlocks = (html: string): DocBlock[] => {
  const blocks: DocBlock[] = [];
  const pushText = (text: string, extra: Omit<DocBlock, 'text'>) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean) blocks.push({ text: clean, ...extra });
  };
  const walkList = (list: Element, depth: number) => {
    const isTaskList = list.getAttribute('data-type') === 'taskList';
    const ordered = list.tagName.toLowerCase() === 'ol';
    Array.from(list.children).forEach((item, index) => {
      if (item.tagName.toLowerCase() !== 'li') return;
      const clone = item.cloneNode(true) as Element;
      clone.querySelectorAll('ul, ol, label').forEach((node) => node.remove());
      const checked = item.getAttribute('data-checked') === 'true';
      const marker = isTaskList ? (checked ? '☑ ' : '☐ ') : ordered ? `${index + 1}. ` : '• ';
      pushText(`${marker}${clone.textContent ?? ''}`, { indent: depth });
      item.querySelectorAll(':scope > ul, :scope > ol, :scope > div > ul, :scope > div > ol')
        .forEach((nested) => walkList(nested, depth + 1));
    });
  };
  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      const tag = child.tagName.toLowerCase();
      const heading = tag.match(/^h([1-6])$/);
      if (heading) {
        pushText(child.textContent ?? '', { heading: Math.min(3, Number(heading[1]) + 1) as 1 | 2 | 3, indent: 0 });
      } else if (tag === 'ul' || tag === 'ol') {
        walkList(child, 0);
      } else if (tag === 'p' || tag === 'pre' || tag === 'blockquote' || tag === 'tr') {
        if (tag === 'blockquote' && child.children.length > 0) walk(child);
        else pushText(tag === 'tr' ? Array.from(child.children).map((cell) => cell.textContent ?? '').join(' | ') : child.textContent ?? '', { indent: 0 });
      } else if (child.children.length > 0) {
        walk(child);
      } else {
        pushText(child.textContent ?? '', { indent: 0 });
      }
    });
  };
  walk(parseBody(html));
  return blocks;
};

const diaryToDocParagraphs = (diary: Diary, includeSpacingAfter = true) => {
  const date = formatDate(diary.createdAt);
  const blocks = htmlToDocBlocks(diary.content);

  return [
    new Paragraph({
      text: diary.title,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Date: ${date}`,
          italics: true,
          size: 20,
        }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      text: '─'.repeat(50),
      spacing: { after: 200 },
    }),
    ...blocks.map((block) =>
      new Paragraph({
        text: block.text,
        ...(block.heading ? { heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][block.heading - 1] } : {}),
        ...(block.indent > 0 ? { indent: { left: block.indent * 360 } } : {}),
        spacing: { after: 100 },
      })
    ),
    ...(includeSpacingAfter ? [new Paragraph({ text: '', spacing: { after: 400 } })] : []),
  ];
};

const createDocxBlob = async (diaries: Diary[]): Promise<Blob> => {
  const doc = new Document({
    sections: [{
      properties: {},
      children: diaries.flatMap((diary, index) => diaryToDocParagraphs(diary, index < diaries.length - 1)),
    }],
  });

  return Packer.toBlob(doc);
};

const preprocessHtmlForPdf = (html: string) => {
  let processedContent = html;

  processedContent = processedContent.replace(
    /<li data-checked="true"[^>]*>[\s\S]*?<input[^>]*>[\s\S]*?<\/label>/g,
    (match) => {
      const textMatch = match.match(/<span[^>]*>([\s\S]*?)<\/span>/);
      const text = textMatch ? textMatch[1] : '';
      return `<li style="list-style: none; display: flex; align-items: flex-start; margin: 0.5em 0;"><span style="display: inline-block; width: 1.5em; flex-shrink: 0;">☑</span><span style="flex: 1;">${text}</span></li>`;
    }
  );

  processedContent = processedContent.replace(
    /<li data-checked="false"[^>]*>[\s\S]*?<input[^>]*>[\s\S]*?<\/label>/g,
    (match) => {
      const textMatch = match.match(/<span[^>]*>([\s\S]*?)<\/span>/);
      const text = textMatch ? textMatch[1] : '';
      return `<li style="list-style: none; display: flex; align-items: flex-start; margin: 0.5em 0;"><span style="display: inline-block; width: 1.5em; flex-shrink: 0;">☐</span><span style="flex: 1;">${text}</span></li>`;
    }
  );

  processedContent = processedContent.replace(
    /<li data-checked="true"[^>]*>/g,
    '<li style="list-style: none; display: flex; align-items: flex-start; margin: 0.5em 0;"><span style="display: inline-block; width: 1.5em; flex-shrink: 0;">☑</span><span style="flex: 1;">'
  );
  processedContent = processedContent.replace(
    /<li data-checked="false"[^>]*>/g,
    '<li style="list-style: none; display: flex; align-items: flex-start; margin: 0.5em 0;"><span style="display: inline-block; width: 1.5em; flex-shrink: 0;">☐</span><span style="flex: 1;">'
  );

  processedContent = processedContent.replace(/<input[^>]*type="checkbox"[^>]*>/g, '');
  processedContent = processedContent.replace(/<label[^>]*>/g, '');
  processedContent = processedContent.replace(/<\/label>/g, '</span>');
  processedContent = processedContent.replace(
    /<ul data-type="taskList"[^>]*>/g,
    '<ul style="padding-left: 0; margin: 1em 0;">'
  );

  return processedContent;
};

// 每篇日记单独渲染成一张图、从新的一页开始。以前所有日记拼成一张超高的图，
// 篇数一多就超过浏览器画布的尺寸上限，导出失败或整页空白。
// 单篇特别长时降低清晰度，保证不超上限；长图分页时仍可能把一行字切在两页之间。
const MAX_CANVAS_HEIGHT = 16000;

const renderDiarySectionHtml = (diary: Diary) => `
  <div style="font-family: ${EXPORT_FONT_FAMILY}; line-height: 1.6; color: #333;">
    <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px; color: #1a1a1a; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
      ${escapeHtml(diary.title)}
    </h1>
    <div style="font-size: 12px; color: #6b7280; margin: 10px 0;">
      <div>创建日期: ${formatDate(diary.createdAt)}</div>
    </div>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    <div style="font-size: 14px; line-height: 1.8;">
      ${preprocessHtmlForPdf(sanitizeDiaryHtml(diary.content))}
    </div>
  </div>
`;

const createPdfBlob = async (diaries: Diary[]): Promise<Blob> => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgWidth = 210;
  const pageHeight = 297;

  for (let index = 0; index < diaries.length; index += 1) {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.width = '800px';
    container.style.padding = '40px';
    container.style.backgroundColor = 'white';
    container.style.fontFamily = EXPORT_FONT_FAMILY;
    container.innerHTML = renderDiarySectionHtml(diaries[index]);
    document.body.appendChild(container);

    try {
      const scale = Math.max(0.75, Math.min(2, MAX_CANVAS_HEIGHT / Math.max(1, container.offsetHeight)));
      const canvas = await html2canvas(container, {
        scale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      // 用 JPEG：PNG 存整页文字图太大（6 篇就有几十 MB），JPEG 0.85 肉眼看不出差别。
      const imgData = canvas.toDataURL('image/jpeg', 0.85);

      if (index > 0) pdf.addPage();
      let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      let heightLeft = imgHeight - pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
    } finally {
      document.body.removeChild(container);
    }
  }

  return pdf.output('blob');
};

const createBlobFromFormat = async (diaries: Diary[], format: ExportFormat): Promise<Blob> => {
  switch (format) {
    case 'json':
      return new Blob([JSON.stringify(diaries, null, 2)], { type: MIME_TYPES.json });
    case 'markdown':
      return new Blob([diaries.map(convertToMarkdown).join('\n\n---\n\n')], { type: MIME_TYPES.markdown });
    case 'html':
      return new Blob([diaries.length === 1 ? convertToHTML(diaries[0]) : createCombinedHTML(diaries)], { type: MIME_TYPES.html });
    case 'docx':
      return createDocxBlob(diaries);
    case 'pdf':
      return createPdfBlob(diaries);
  }
};

export const buildExportEntries = async (
  diaries: Diary[],
  format: ExportFormat,
  fileMode: ExportFileMode
): Promise<ExportEntry[]> => {
  if (fileMode === 'combined' || diaries.length === 1) {
    const blob = await createBlobFromFormat(diaries, format);
    const baseName = diaries.length === 1
      ? sanitizeFilename(diaries[0].title)
      : `all_diaries_${Date.now()}`;

    return [{
      filename: `${baseName}.${EXTENSIONS[format]}`,
      blob,
    }];
  }

  // 同名日记（比如两篇都叫「未命名」）加上 (2)、(3)，拆分导出时不会互相覆盖。
  const used = new Map<string, number>();
  const uniqueName = (title: string) => {
    const base = sanitizeFilename(title);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  };
  return Promise.all(
    diaries.map(async (diary) => ({
      filename: `${uniqueName(diary.title)}.${EXTENSIONS[format]}`,
      blob: await createBlobFromFormat([diary], format),
    }))
  );
};

export const saveBlobWithPicker = async (entry: ExportEntry) => {
  if (isTauriRuntime()) {
    await downloadFile(entry.filename, entry.blob);
    return;
  }
  const fileWindow = window as FilePickerWindow;
  if (!fileWindow.showSaveFilePicker) {
    saveAs(entry.blob, entry.filename);
    return;
  }

  const handle = await fileWindow.showSaveFilePicker({
    suggestedName: entry.filename,
    types: [{
      description: entry.filename.split('.').pop()?.toUpperCase() || 'File',
      accept: {
        [entry.blob.type || 'application/octet-stream']: [`.${entry.filename.split('.').pop()}`],
      },
    }],
  });

  const writable = await handle.createWritable();
  await writable.write(entry.blob);
  await writable.close();
};

const saveBlobsToDirectory = async (entries: ExportEntry[]) => {
  if (isTauriRuntime()) {
    // 桌面版：放进「下载」里一个带时间的子文件夹，只在最后一个文件上打开访达。
    const subfolder = `Glimmer 导出 ${new Date().toLocaleString('zh-CN', { hour12: false }).replace(/[/:]/g, '-')}`;
    for (let i = 0; i < entries.length; i += 1) {
      await downloadFile(entries[i].filename, entries[i].blob, { subfolder, reveal: i === entries.length - 1 });
    }
    return false;
  }
  const fileWindow = window as FilePickerWindow;
  if (!fileWindow.showDirectoryPicker) {
    entries.forEach((entry) => saveAs(entry.blob, entry.filename));
    return false;
  }

  const directoryHandle = await fileWindow.showDirectoryPicker();
  for (const entry of entries) {
    const fileHandle = await directoryHandle.getFileHandle(entry.filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(entry.blob);
    await writable.close();
  }
  return true;
};

export const saveExportEntries = async (entries: ExportEntry[]) => {
  if (entries.length === 1) {
    await saveBlobWithPicker(entries[0]);
    return 'single';
  }

  const mode = await saveBlobsToDirectory(entries);
  return mode ? 'directory' : 'downloads';
};

export const getExportMimeType = (format: ExportFormat) => MIME_TYPES[format];
