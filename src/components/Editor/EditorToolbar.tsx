import React, { useCallback } from 'react';
import { Editor, useEditorState } from '@tiptap/react';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Image as ImageIcon,
  Table as TableIcon,
  Minus,
  Undo,
  Redo,
  Indent,
  Outdent,
  ListEnd,
  ListRestart,
} from 'lucide-react';

import { t } from '../../i18n';

interface EditorToolbarProps {
  editor: Editor;
}

type ToolbarButtonProps = {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
  className?: string;
};

type OrderedListInfo = {
  node: ProseMirrorNode;
  pos: number;
  start: number;
  itemCount: number;
};

const getOrderedListAtSelection = (editor: Editor): OrderedListInfo | null => {
  const { $from } = editor.state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== 'orderedList') continue;

    return {
      node,
      pos: $from.before(depth),
      start: Number(node.attrs.start || 1),
      itemCount: node.childCount,
    };
  }

  return null;
};

const getPreviousOrderedList = (editor: Editor, currentListPos: number): OrderedListInfo | null => {
  let previous: OrderedListInfo | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (pos >= currentListPos) return false;
    if (node.type.name === 'orderedList') {
      previous = {
        node,
        pos,
        start: Number(node.attrs.start || 1),
        itemCount: node.childCount,
      };
    }
    return true;
  });

  return previous;
};

const setOrderedListStart = (editor: Editor, start: number) => {
  const currentList = getOrderedListAtSelection(editor);
  if (!currentList) return;

  const safeStart = Math.max(1, Math.trunc(start));
  const { state, view } = editor;
  view.dispatch(
    state.tr.setNodeMarkup(currentList.pos, undefined, {
      ...currentList.node.attrs,
      start: safeStart,
    })
  );
  view.focus();
};

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, isActive, disabled = false, children, title, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={`p-2 rounded-lg transition-colors duration-200 active:scale-95 flex items-center justify-center w-10 h-10 ${disabled ? 'cursor-not-allowed opacity-40 active:scale-100' : ''} ${className}`}
    style={{
      backgroundColor: isActive ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
      color: isActive ? 'var(--aurora-accent)' : 'var(--aurora-secondary)'
    }}
    onMouseEnter={(e) => {
      if (!isActive && !disabled) {
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
        e.currentTarget.style.color = 'var(--aurora-accent)';
      }
    }}
    onMouseLeave={(e) => {
      if (!isActive && !disabled) {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = 'var(--aurora-secondary)';
      }
    }}
  >
    {children}
  </button>
);

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor }) => {
  const orderedListState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const currentList = getOrderedListAtSelection(currentEditor);
      if (!currentList) return null;
      const previousList = getPreviousOrderedList(currentEditor, currentList.pos);

      return {
        start: currentList.start,
        continuationStart: previousList ? previousList.start + previousList.itemCount : null,
      };
    },
  });

  const maxUsedHeading = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      let maxLevel = 0;
      currentEditor.state.doc.descendants((node) => {
        if (node.type.name === 'heading') {
          const level = Number(node.attrs.level || 0);
          if (level > maxLevel) {
            maxLevel = level;
          }
        }
      });
      return maxLevel;
    },
  });

  const maxVisibleHeadingLevel = Math.min(6, Math.max(3, maxUsedHeading + 1));

  const addImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const url = event.target?.result as string;
          editor.chain().focus().setImage({ src: url }).run();
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }, [editor]);



  const addTable = useCallback(() => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  const renderHeadingIcon = (level: number) => {
    const iconProps = { size: 16 };
    
    // 为所有标题级别使用相同的居中容器，确保对齐一致
    return (
      <span className="flex items-center justify-center">
        {level === 1 && <Heading1 {...iconProps} />}
        {level === 2 && <Heading2 {...iconProps} />}
        {level === 3 && <Heading3 {...iconProps} />}
        {level >= 4 && <span className="text-xs">H{level}</span>}
      </span>
    );
  };

  return (
    <>
      {/* 工具栏 - 毛玻璃风 */}
      <div className="p-3 flex flex-wrap gap-0.5" style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)', borderBottom: '1px solid rgba(200, 210, 220, 0.4)' }}>
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        title={t('Undo')}
      >
        <Undo size={18} strokeWidth={1.75} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        title={t('Redo')}
      >
        <Redo size={18} strokeWidth={1.75} />
      </ToolbarButton>

      <div className="flex">
        {Array.from({ length: maxVisibleHeadingLevel }, (_, index) => index + 1).map((level, i) => (
          <ToolbarButton
            key={level}
            onClick={() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run()}
            isActive={editor.isActive('heading', { level })}
            title={t(`Heading ${level}`)}
            className={`${i === 0 ? 'rounded-r-none' : i === maxVisibleHeadingLevel - 1 ? 'rounded-l-none' : 'rounded-l-none rounded-r-none'}`}
          >
            {renderHeadingIcon(level)}
          </ToolbarButton>
        ))}
      </div>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title={t('Bullet List')}
      >
        <List size={18} strokeWidth={1.75} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title={t('Ordered List')}
      >
        <ListOrdered size={18} strokeWidth={1.75} />
      </ToolbarButton>
      {orderedListState && (
        <div className="flex rounded-lg border border-slate-200/70 bg-white/35">
          <ToolbarButton
            onClick={() => {
              if (!orderedListState.continuationStart) return;
              setOrderedListStart(editor, orderedListState.continuationStart);
            }}
            disabled={!orderedListState.continuationStart}
            title={`${t('Continue ordered list')}${orderedListState.continuationStart ? ` (${orderedListState.continuationStart})` : ''}`}
            className="rounded-r-none"
          >
            <ListEnd size={18} strokeWidth={1.75} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => setOrderedListStart(editor, 1)}
            disabled={orderedListState.start === 1}
            title={t('Restart ordered list')}
            className="rounded-l-none border-l border-slate-200/70"
          >
            <ListRestart size={18} strokeWidth={1.75} />
          </ToolbarButton>
        </div>
      )}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive('taskList')}
        title={t('Task List')}
      >
        <CheckSquare size={18} strokeWidth={1.75} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => {
          // Indent current paragraph: insert two spaces at the beginning of the current paragraph
          const { state, dispatch } = editor.view;
          const { $from } = state.selection;
          
          // Find the start position of the current paragraph/block node
          const paragraphStart = $from.start($from.depth);
          
          // Skip inserting spaces at the very beginning of the document
          // unless there's already content after it
          const isAtDocumentStart = paragraphStart === 0;
          const hasContentAfter = paragraphStart < state.doc.nodeSize - 2;
          
          if (!isAtDocumentStart || (isAtDocumentStart && hasContentAfter)) {
            const tr = state.tr.insertText('  ', paragraphStart, paragraphStart);
            dispatch(tr);
          }
        }}
        title={t('Indent')}
      >
        <Indent size={18} strokeWidth={1.75} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => {
          // Outdent current paragraph: remove two spaces from the beginning of the current paragraph
          const { state, dispatch } = editor.view;
          const { $from } = state.selection;
          
          // Find the start position of the current paragraph/block node
          const paragraphStart = $from.start($from.depth);
          
          // Check if there are spaces to remove
          if (paragraphStart < state.doc.nodeSize - 2) {
            const text = state.doc.textBetween(paragraphStart, paragraphStart + 2);
            if (text === '  ') {
              // Remove two spaces
              const tr = state.tr.delete(paragraphStart, paragraphStart + 2);
              dispatch(tr);
            } else if (text === '\t') {
              // Remove tab character for backward compatibility
              const tr = state.tr.delete(paragraphStart, paragraphStart + 1);
              dispatch(tr);
            }
          }
        }}
        title={t('Outdent')}
      >
        <Outdent size={18} strokeWidth={1.75} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title={t('Quote')}
      >
        <Quote size={18} strokeWidth={1.75} />
      </ToolbarButton>

      <ToolbarButton onClick={addImage} title={t('Add Image')}>
        <ImageIcon size={18} strokeWidth={1.75} />
      </ToolbarButton>
      <ToolbarButton onClick={addTable} title={t('Insert Table')}>
        <TableIcon size={18} strokeWidth={1.75} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title={t('Horizontal Rule')}
      >
        <Minus size={18} strokeWidth={1.75} />
      </ToolbarButton>

      </div>
    </>
  );
};
