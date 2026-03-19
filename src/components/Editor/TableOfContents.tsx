import React, { useMemo, useCallback } from 'react';
import { FileText } from 'lucide-react';
import { extractHeadings } from '../../utils/toc';
import { t } from '../../i18n';

interface TableOfContentsProps {
  content: string;
  headerAction?: React.ReactNode;
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({ content, headerAction }) => {
  const headings = useMemo(() => extractHeadings(content), [content]);

  // 点击目录项时滚动到对应标题
  const handleHeadingClick = useCallback((e: React.MouseEvent, headingIndex: number) => {
    e.preventDefault();
    
    // 查找编辑器容器中的所有标题元素
    const editorContainer = document.querySelector('.ProseMirror');
    if (!editorContainer) return;
    
    const allHeadings = editorContainer.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const targetHeading = allHeadings[headingIndex] as HTMLElement;
    
    if (targetHeading) {
      // 平滑滚动到目标标题
      targetHeading.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start'
      });
      
      // 添加高亮闪烁效果
      targetHeading.style.transition = 'background-color 0.3s ease';
      targetHeading.style.backgroundColor = 'rgba(0, 122, 255, 0.15)';
      targetHeading.style.borderRadius = '6px';
      
      setTimeout(() => {
        targetHeading.style.backgroundColor = 'transparent';
      }, 1500);
    }
  }, []);

  if (headings.length === 0) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-gradient-to-b from-slate-50/80 to-blue-50/40">
        <div className="px-4 py-3 border-b border-slate-200/60 bg-white/90 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 tracking-tight">{t('Table of Contents')}</h3>
          {headerAction}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-4">
          <FileText size={32} className="mb-2 opacity-50" strokeWidth={1.5} />
          <p className="text-sm text-center">{t('No headings in this article')}</p>
        </div>
      </div>
    );
  }

  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-b from-slate-50/80 to-blue-50/40">
      <div className="px-4 py-3 border-b border-slate-200/60 bg-white/90 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 tracking-tight">{t('Table of Contents')}</h3>
        {headerAction}
      </div>
      <div className="flex-1 overflow-y-auto">
        <ul className="p-3 space-y-0.5">
          {headings.map((heading, index) => (
            <li
              key={heading.id}
              style={{
                marginLeft: `${(heading.level - minLevel) * 14}px`,
              }}
            >
              <button
                onClick={(e) => handleHeadingClick(e, index)}
                className="w-full text-left text-sm text-slate-600 hover:text-blue-600 hover:bg-white/80 rounded-lg px-2 py-1.5 truncate block transition-all duration-200 active:scale-[0.98] hover:shadow-sm"
                title={heading.title}
              >
                <span className="inline-flex items-center justify-center w-5 h-5 text-2xs font-medium text-slate-400 bg-slate-100 rounded mr-1.5">
                  H{heading.level}
                </span>
                <span className="font-medium">{heading.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
