import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { Diary } from '../types';
import { formatDate } from './date';

export type ExportFormat = 'markdown' | 'html' | 'json' | 'docx' | 'pdf';
export type ExportFileMode = 'combined' | 'separate';

type ExportEntry = {
  filename: string;
  blob: Blob;
};

type FilePickerWindow = Window & {
  showSaveFilePicker?: (options?: any) => Promise<any>;
  showDirectoryPicker?: (options?: any) => Promise<any>;
};

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
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'untitled';

export const convertToMarkdown = (diary: Diary): string => {
  const date = formatDate(diary.createdAt);
  const tags = diary.tags.length > 0 ? `\nTags: ${diary.tags.join(', ')}` : '';

  let content = diary.content;
  content = content.replace(/<h1>(.*?)<\/h1>/g, '# $1\n');
  content = content.replace(/<h2>(.*?)<\/h2>/g, '## $1\n');
  content = content.replace(/<h3>(.*?)<\/h3>/g, '### $1\n');
  content = content.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
  content = content.replace(/<em>(.*?)<\/em>/g, '*$1*');
  content = content.replace(/<code>(.*?)<\/code>/g, '`$1`');
  content = content.replace(/<p>(.*?)<\/p>/g, '$1\n\n');
  content = content.replace(/<br\s*\/?>/g, '\n');
  content = content.replace(/<[^>]+>/g, '');

  return `# ${diary.title}\n\nDate: ${date}${tags}\n\n---\n\n${content}`;
};

const renderDiaryBodyHTML = (diary: Diary) => {
  const date = formatDate(diary.createdAt);
  const tags = diary.tags.length > 0
    ? `<div class="tags">${diary.tags.map(tag => `<span class="tag">${tag}</span>`).join(' ')}</div>`
    : '';

  return `
    <article class="diary-entry">
      <h1>${diary.title}</h1>
      <div class="meta">Created: ${date}</div>
      ${tags}
      <div class="content">${diary.content}</div>
    </article>
  `;
};

export const convertToHTML = (diary: Diary): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${diary.title}</title>
  <style>${getExportStyles()}</style>
</head>
<body>
  ${renderDiaryBodyHTML(diary)}
</body>
</html>`;

const getExportStyles = () => `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
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
  .tags {
    margin: 1rem 0;
  }
  .tag {
    display: inline-block;
    background: #dbeafe;
    color: #1e40af;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.875rem;
    margin-right: 0.5rem;
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

const htmlToPlainText = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

const diaryToDocParagraphs = (diary: Diary, includeSpacingAfter = true) => {
  const date = formatDate(diary.createdAt);
  const plainText = htmlToPlainText(diary.content);

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
    ...(diary.tags.length > 0 ? [
      new Paragraph({
        children: [
          new TextRun({
            text: `Tags: ${diary.tags.join(', ')}`,
            italics: true,
            size: 20,
          }),
        ],
        spacing: { after: 200 },
      }),
    ] : []),
    new Paragraph({
      text: '─'.repeat(50),
      spacing: { after: 200 },
    }),
    ...plainText.split('\n').filter(line => line.trim()).map(line =>
      new Paragraph({
        text: line,
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

const createPdfBlob = async (diaries: Diary[]): Promise<Blob> => {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.width = '800px';
  container.style.padding = '40px';
  container.style.backgroundColor = 'white';
  container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

  container.innerHTML = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif; line-height: 1.6; color: #333;">
      ${diaries.map((diary, index) => {
        const date = formatDate(diary.createdAt);
        return `
          <section style="${index > 0 ? 'margin-top: 48px; padding-top: 32px; border-top: 1px solid #e5e7eb;' : ''}">
            <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px; color: #1a1a1a; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
              ${diary.title}
            </h1>
            <div style="font-size: 12px; color: #6b7280; margin: 10px 0;">
              <div>创建日期: ${date}</div>
              ${diary.tags.length > 0 ? `<div style="margin-top: 5px;">标签: ${diary.tags.join(', ')}</div>` : ''}
            </div>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <div style="font-size: 14px; line-height: 1.8;">
              ${preprocessHtmlForPdf(diary.content)}
            </div>
          </section>
        `;
      }).join('')}
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgData = canvas.toDataURL('image/png');

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
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

  return Promise.all(
    diaries.map(async (diary) => ({
      filename: `${sanitizeFilename(diary.title)}.${EXTENSIONS[format]}`,
      blob: await createBlobFromFormat([diary], format),
    }))
  );
};

export const saveBlobWithPicker = async (entry: ExportEntry) => {
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
