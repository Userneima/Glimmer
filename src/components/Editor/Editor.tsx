import React, { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Strike } from '@tiptap/extension-strike';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Highlight } from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { EditorToolbar } from './EditorToolbar';
import { TextBubbleMenu } from './TextBubbleMenu';

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  editable?: boolean;
  contentRightPanel?: React.ReactNode;
  onAnalyze?: () => void;
}

export const Editor: React.FC<EditorProps> = ({
  content,
  onChange,
  editable = true,
  contentRightPanel,
  onAnalyze,
}) => {
  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      // Disabled because we import these extensions separately with custom config
      strike: false,
      link: false, // Disable built-in link, we use custom config below
      underline: false, // Disable built-in underline, we use custom config below
    }),
    Underline.configure({
      HTMLAttributes: {
        class: 'underline',
      },
    }),
    Strike,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-blue-600 underline cursor-pointer',
      },
    }),
    Image.configure({
      HTMLAttributes: {
        class: 'max-w-full h-auto rounded-lg',
      },
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Highlight.configure({
      multicolor: true,
    }),
    TextStyle,
    Color,
  ], []);

  const editorContentRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions,
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none max-w-none',
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          const { state, dispatch } = view;
          const { $from } = state.selection;
          
          // Find the start position of the current paragraph/block node
          let position = $from.start($from.depth);
          
          if (event.shiftKey) {
            // Shift+Tab: Outdent (remove two spaces)
            if (position < state.doc.nodeSize - 2) {
              const text = state.doc.textBetween(position, position + 2);
              if (text === '  ') {
                const tr = state.tr.delete(position, position + 2);
                dispatch(tr);
              } else if (text === '\t') {
                // Also handle tab characters for backward compatibility
                const tr = state.tr.delete(position, position + 1);
                dispatch(tr);
              }
            }
          } else {
            // Tab: Indent (add two spaces)
            // Skip inserting spaces at the very beginning of the document
            // unless there's already content after it
            const isAtDocumentStart = position === 0;
            const hasContentAfter = position < state.doc.nodeSize - 2;
            
            if (!isAtDocumentStart || (isAtDocumentStart && hasContentAfter)) {
              const tr = state.tr.insertText('  ', position, position);
              dispatch(tr);
            }
          }
          return true;
        }
        return false;
      },
      // Enable text selection on long press
      handleDOMEvents: {
        // Allow all default behavior for text selection
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    /* 编辑器主容器 - 毛玻璃风 */
    <div className="flex flex-col h-full" style={{ backgroundColor: 'rgba(255, 255, 255, 0.75)' }} ref={editorContentRef}>
      {editable && <EditorToolbar editor={editor} onAnalyze={onAnalyze} />}
      {editable && <TextBubbleMenu editor={editor} />}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-y-auto" style={{ 
          WebkitUserSelect: 'text',
          userSelect: 'text',
          touchAction: 'pan-x pan-y',
          pointerEvents: 'auto'
        }}>
          <EditorContent editor={editor} className="h-full" />
        </div>
        {contentRightPanel}
      </div>
    </div>
  );
};
