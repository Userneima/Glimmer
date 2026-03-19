import React, { useState } from 'react';
import { FileText, Code, FileJson, FileType, File, Check } from 'lucide-react';
import { ActionMenu } from './ActionMenu';
import type { Diary } from '../../types';
import { Modal } from '../UI/Modal';
import { formatDate } from '../../utils/date';
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { t } from '../../i18n';
import { storage } from '../../utils/storage';
import { ModalFooter } from './ModalFooter';
import { showToast } from '../../utils/toast';



interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  diaries: Diary[];
  currentDiary: Diary | null;
} 

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  diaries,
  currentDiary,
}) => {
  const [exportType, setExportType] = useState<'current' | 'all'>('current');
  const [format, setFormat] = useState<'markdown' | 'html' | 'json' | 'docx' | 'pdf'>('markdown');
  const [isExporting, setIsExporting] = useState(false);

  const getFormatButtonClass = (targetFormat: 'markdown' | 'html' | 'json' | 'docx' | 'pdf') => {
    return `p-3 border rounded-lg flex flex-col items-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
      format === targetFormat
        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
        : 'hover:bg-gray-50 text-gray-700'
    }`;
  };

  const convertToMarkdown = (diary: Diary): string => {
    const date = formatDate(diary.createdAt);
    const tags = diary.tags.length > 0 ? `\nTags: ${diary.tags.join(', ')}` : '';

    // Convert HTML to Markdown (basic conversion)
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

  const convertToHTML = (diary: Diary): string => {
    const date = formatDate(diary.createdAt);
    const tags = diary.tags.length > 0
      ? `<div class="tags">${diary.tags.map(tag => `<span class="tag">${tag}</span>`).join(' ')}</div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${diary.title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
            color: #333;
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
    </style>
</head>
<body>
    <h1>${diary.title}</h1>
    <div class="meta">Created: ${date}</div>
    ${tags}
    <div class="content">
        ${diary.content}
    </div>
</body>
</html>`;
  };

  const htmlToPlainText = (html: string): string => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  const convertToDocx = async (diary: Diary): Promise<Blob> => {
    const date = formatDate(diary.createdAt);
    const plainText = htmlToPlainText(diary.content);

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
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
        ],
      }],
    });

    return await Packer.toBlob(doc);
  };

  const convertToPDF = async (diary: Diary): Promise<void> => {
    const date = formatDate(diary.createdAt);

    // 处理任务列表，将checkbox转换为文本符号
    let processedContent = diary.content;

    // 将任务列表的checkbox转换为Unicode符号，使用更好的样式
    processedContent = processedContent.replace(
      /<li data-checked="true"[^>]*>[\s\S]*?<input[^>]*>[\s\S]*?<\/label>/g,
      (match) => {
        // 提取文本内容
        const textMatch = match.match(/<span[^>]*>([\s\S]*?)<\/span>/);
        const text = textMatch ? textMatch[1] : '';
        return `<li style="list-style: none; display: flex; align-items: flex-start; margin: 0.5em 0;"><span style="display: inline-block; width: 1.5em; flex-shrink: 0;">☑</span><span style="flex: 1;">${text}</span></li>`;
      }
    );

    processedContent = processedContent.replace(
      /<li data-checked="false"[^>]*>[\s\S]*?<input[^>]*>[\s\S]*?<\/label>/g,
      (match) => {
        // 提取文本内容
        const textMatch = match.match(/<span[^>]*>([\s\S]*?)<\/span>/);
        const text = textMatch ? textMatch[1] : '';
        return `<li style="list-style: none; display: flex; align-items: flex-start; margin: 0.5em 0;"><span style="display: inline-block; width: 1.5em; flex-shrink: 0;">☐</span><span style="flex: 1;">${text}</span></li>`;
      }
    );

    // 如果上面的正则没匹配到，尝试更简单的替换
    processedContent = processedContent.replace(
      /<li data-checked="true"[^>]*>/g,
      '<li style="list-style: none; display: flex; align-items: flex-start; margin: 0.5em 0;"><span style="display: inline-block; width: 1.5em; flex-shrink: 0;">☑</span><span style="flex: 1;">'
    );
    processedContent = processedContent.replace(
      /<li data-checked="false"[^>]*>/g,
      '<li style="list-style: none; display: flex; align-items: flex-start; margin: 0.5em 0;"><span style="display: inline-block; width: 1.5em; flex-shrink: 0;">☐</span><span style="flex: 1;">'
    );

    // 移除input checkbox元素和label
    processedContent = processedContent.replace(/<input[^>]*type="checkbox"[^>]*>/g, '');
    processedContent = processedContent.replace(/<label[^>]*>/g, '');
    processedContent = processedContent.replace(/<\/label>/g, '</span>');

    // 处理任务列表的ul标签
    processedContent = processedContent.replace(
      /<ul data-type="taskList"[^>]*>/g,
      '<ul style="padding-left: 0; margin: 1em 0;">'
    );

    // 创建一个临时的HTML容器用于渲染
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.width = '800px';
    container.style.padding = '40px';
    container.style.backgroundColor = 'white';
    container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

    container.innerHTML = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif; line-height: 1.6; color: #333;">
        <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px; color: #1a1a1a; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
          ${diary.title}
        </h1>
        <div style="font-size: 12px; color: #6b7280; margin: 10px 0;">
          <div>创建日期: ${date}</div>
          ${diary.tags.length > 0 ? `<div style="margin-top: 5px;">标签: ${diary.tags.join(', ')}</div>` : ''}
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <div style="font-size: 14px; line-height: 1.8;">
          ${processedContent}
        </div>
      </div>
    `;

    document.body.appendChild(container);

    try {
      // 使用html2canvas将HTML转换为canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // 创建PDF
      const imgWidth = 210; // A4宽度（mm）
      const pageHeight = 297; // A4高度（mm）
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // 如果内容超过一页，添加新页
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = `${diary.title.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}.pdf`;
      pdf.save(filename);
    } finally {
      // 清理临时容器
      document.body.removeChild(container);
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAllData = (format?: 'json' | 'markdown' | 'html') => {
    try {
      if (!format || format === 'json') {
        const all = storage.getAllData();
        const content = JSON.stringify(all, null, 2);
        const filename = `all_data_${Date.now()}.json`;
        downloadFile(content, filename, 'application/json');
        return;
      }

      // For markdown/html, export combined diaries
      const diariesToExport = diaries;
      if (format === 'markdown') {
        const content = diariesToExport.map(d => convertToMarkdown(d)).join('\n\n---\n\n');
        const filename = `all_diaries_${Date.now()}.md`;
        downloadFile(content, filename, 'text/markdown');
        return;
      }

      if (format === 'html') {
        const allContent = diariesToExport.map(d => convertToHTML(d)).join('\n\n<hr>\n\n');
        const filename = `all_diaries_${Date.now()}.html`;
        downloadFile(allContent, filename, 'text/html');
        return;
      }
    } catch (err) {
      console.error('exportAllData failed', err);
      showToast(t('Export failed. Please try again.'), 'error');
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const diariesToExport = exportType === 'current' && currentDiary ? [currentDiary] : diaries;

      if (diariesToExport.length === 0) {
        showToast(t('No diaries to export'), 'error');
        return;
      }

      if (format === 'json') {
        const content = JSON.stringify(diariesToExport, null, 2);
        const filename = exportType === 'current'
          ? `${currentDiary!.title.replace(/[^a-z0-9]/gi, '_')}.json`
          : `all_diaries_${Date.now()}.json`;
        downloadFile(content, filename, 'application/json');
      } else if (format === 'markdown') {
        if (exportType === 'current' && currentDiary) {
          const content = convertToMarkdown(currentDiary);
          const filename = `${currentDiary.title.replace(/[^a-z0-9]/gi, '_')}.md`;
          downloadFile(content, filename, 'text/markdown');
        } else {
          const content = diariesToExport.map(d => convertToMarkdown(d)).join('\n\n---\n\n');
          const filename = `all_diaries_${Date.now()}.md`;
          downloadFile(content, filename, 'text/markdown');
        }
      } else if (format === 'html') {
        if (exportType === 'current' && currentDiary) {
          const content = convertToHTML(currentDiary);
          const filename = `${currentDiary.title.replace(/[^a-z0-9]/gi, '_')}.html`;
          downloadFile(content, filename, 'text/html');
        } else {
          const allContent = diariesToExport.map(d => convertToHTML(d)).join('\n\n<hr>\n\n');
          const filename = `all_diaries_${Date.now()}.html`;
          downloadFile(allContent, filename, 'text/html');
        }
      } else if (format === 'docx') {
        if (exportType === 'current' && currentDiary) {
          const blob = await convertToDocx(currentDiary);
          const filename = `${currentDiary.title.replace(/[^a-z0-9]/gi, '_')}.docx`;
          saveAs(blob, filename);
        } else {
          // Export all diaries as separate Word files would be complex
          // For now, export as a single combined document
          showToast(t('Exporting all diaries to Word format will create separate files. Please export one at a time for now.'), 'info');
          return;
        }
      } else if (format === 'pdf') {
        if (exportType === 'current' && currentDiary) {
          await convertToPDF(currentDiary);
        } else {
          showToast(t('Exporting all diaries to PDF format will create separate files. Please export one at a time for now.'), 'info');
          return;
        }
      }

      showToast(t('Export completed'), 'success');
      onClose();
    } catch (error) {
      console.error('Export error:', error);
      showToast(t('Export failed. Please try again.'), 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Export Diaries')}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('Export Scope')}
          </label>
          <div className="space-y-2">
            <label
              className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors relative ${
                exportType === 'current'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                  : 'hover:bg-gray-50'
              } ${!currentDiary ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                value="current"
                checked={exportType === 'current'}
                onChange={(e) => setExportType(e.target.value as 'current')}
                disabled={!currentDiary}
                className="accent-blue-600"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{t('Current Diary')}</div>
                <div className="text-sm text-gray-500 truncate">
                  {currentDiary ? currentDiary.title : t('No diary selected')}
                </div>
              </div>
              {exportType === 'current' && <Check size={16} className="text-blue-600 ml-2" />}
            </label>
            <label
              className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors relative ${
                exportType === 'all'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                  : 'hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                value="all"
                checked={exportType === 'all'}
                onChange={(e) => setExportType(e.target.value as 'all')}
                className="accent-blue-600"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{t('All Diaries')}</div>
                <div className="text-sm text-gray-500">
                  {t('Export all')} {diaries.length} {t('Diaries')}
                </div>
              </div>
              {exportType === 'all' && <Check size={16} className="text-blue-600 ml-2" />}
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('Export Format')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setFormat('markdown')}
              role="button"
              aria-pressed={format === 'markdown'}
              className={getFormatButtonClass('markdown')}
            >
              <FileText size={24} />
              <span className="text-sm font-medium">{t('Markdown')}</span>
            </button>
            <button
              onClick={() => setFormat('html')}
              role="button"
              aria-pressed={format === 'html'}
              className={getFormatButtonClass('html')}
            >
              <Code size={24} />
              <span className="text-sm font-medium">{t('HTML')}</span>
            </button>
            <button
              onClick={() => setFormat('json')}
              role="button"
              aria-pressed={format === 'json'}
              className={getFormatButtonClass('json')}
            >
              <FileJson size={24} />
              <span className="text-sm font-medium">{t('JSON')}</span>
            </button>
            <button
              onClick={() => setFormat('docx')}
              role="button"
              aria-pressed={format === 'docx'}
              className={getFormatButtonClass('docx')}
            >
              <FileType size={24} />
              <span className="text-sm font-medium">{t('Word')}</span>
            </button>
            <button
              onClick={() => setFormat('pdf')}
              role="button"
              aria-pressed={format === 'pdf'}
              className={getFormatButtonClass('pdf')}
            >
              <File size={24} />
              <span className="text-sm font-medium">{t('PDF')}</span>
            </button>
          </div>
          {(format === 'docx' || format === 'pdf') && exportType === 'all' && (
            <p className="text-xs text-amber-600 mt-2">
              {t('Note: Word and PDF formats currently support single diary export only.')}
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-4 items-center">
          <ModalFooter
            primaryLabel={isExporting ? t('Exporting...') : t('Export')}
            primaryOnClick={handleExport}
            primaryDisabled={isExporting}
            secondaryLabel={t('Cancel')}
            secondaryOnClick={onClose}
          >
            <div className="ml-1">
              <ActionMenu
                items={[
                  {
                    label: t('Export All Data'),
                    children: [
                      { label: 'JSON', onClick: () => exportAllData('json') },
                      { label: t('Markdown'), onClick: () => exportAllData('markdown') },
                      { label: t('HTML'), onClick: () => exportAllData('html') },
                    ],
                  },
                ]}
              />
            </div>
          </ModalFooter>
        </div>
      </div>
    </Modal>
  );
};
