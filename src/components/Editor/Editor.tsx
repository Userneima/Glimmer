import React, { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { AllSelection, TextSelection } from 'prosemirror-state';
import { CellSelection, TableMap, cellAround, findTable, isInTable, selectedRect } from 'prosemirror-tables';
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
import { TableBubbleMenu } from './TableBubbleMenu';

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  editable?: boolean;
  contentRightPanel?: React.ReactNode;
  onAnalyze?: () => void;
  diaryId?: string;
  highlightRange?: { from: number; to: number };
}

export const Editor: React.FC<EditorProps> = ({
  content,
  onChange,
  editable = true,
  contentRightPanel,
  onAnalyze,
  highlightRange,
}) => {
  const CustomTableCell = useMemo(
    () =>
      TableCell.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            textAlign: {
              default: null,
              parseHTML: (element) => element.style.textAlign || null,
              renderHTML: (attributes) =>
                attributes.textAlign ? { style: `text-align: ${attributes.textAlign};` } : {},
            },
            verticalAlign: {
              default: null,
              parseHTML: (element) => element.style.verticalAlign || null,
              renderHTML: (attributes) =>
                attributes.verticalAlign ? { style: `vertical-align: ${attributes.verticalAlign};` } : {},
            },
          };
        },
      }),
    []
  );

  const CustomTableHeader = useMemo(
    () =>
      TableHeader.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            textAlign: {
              default: null,
              parseHTML: (element) => element.style.textAlign || null,
              renderHTML: (attributes) =>
                attributes.textAlign ? { style: `text-align: ${attributes.textAlign};` } : {},
            },
            verticalAlign: {
              default: null,
              parseHTML: (element) => element.style.verticalAlign || null,
              renderHTML: (attributes) =>
                attributes.verticalAlign ? { style: `vertical-align: ${attributes.verticalAlign};` } : {},
            },
          };
        },
      }),
    []
  );

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
    Image.extend({
      addAttributes() {
        return {
          src: { default: null },
          alt: { default: null },
          title: { default: null },
          width: { default: null },
          style: { default: null },
        };
      },
    }).configure({
      HTMLAttributes: {
        class: 'max-w-full h-auto rounded-lg',
      },
    }),
    Table.configure({
      resizable: true,
      cellMinWidth: 36,
      handleWidth: 6,
      lastColumnResizable: true,
    }),
    TableRow,
    CustomTableCell,
    CustomTableHeader,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Highlight.configure({
      multicolor: true,
    }),
    TextStyle,
    Color,
  ], [CustomTableCell, CustomTableHeader]);

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
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
          const { state, dispatch } = view;
          const { selection, doc } = state;

          if (isInTable(state)) {
            event.preventDefault();

            if (selection instanceof CellSelection) {
              const rect = selectedRect(state);
              const isWholeTableSelected =
                rect.left === 0 &&
                rect.top === 0 &&
                rect.right === rect.map.width &&
                rect.bottom === rect.map.height;

              if (isWholeTableSelected) {
                dispatch(state.tr.setSelection(new AllSelection(doc)));
                return true;
              }

              const firstCellPos = rect.tableStart + rect.map.map[0];
              const lastCellPos = rect.tableStart + rect.map.map[rect.map.map.length - 1];
              dispatch(state.tr.setSelection(CellSelection.create(doc, firstCellPos, lastCellPos)));
              return true;
            }

            const table = findTable(selection.$from);
            const cell = cellAround(selection.$from);

            if (table && cell) {
              const cellNode = cell.nodeAfter;

              if (cellNode) {
                const cellContentFrom = cell.pos + 1;
                const cellContentTo = cell.pos + cellNode.nodeSize - 1;
                const isWholeCellContentSelected =
                  selection.from === cellContentFrom && selection.to === cellContentTo;

                if (isWholeCellContentSelected) {
                  const map = TableMap.get(table.node);
                  const firstCellPos = table.start + map.map[0];
                  const lastCellPos = table.start + map.map[map.map.length - 1];
                  dispatch(state.tr.setSelection(CellSelection.create(doc, firstCellPos, lastCellPos)));
                  return true;
                }

                dispatch(state.tr.setSelection(TextSelection.create(doc, cellContentFrom, cellContentTo)));
                return true;
              }
            }
          }
        }

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

  const editorContentRef = useRef<HTMLDivElement>(null);

  // Highlight range effect
  useEffect(() => {
    if (editor && highlightRange) {
      // Scroll to the position
      editor.commands.setTextSelection(highlightRange.from);
      
      // Add highlight mark to the range
      editor.chain()
        .focus()
        .setTextSelection(highlightRange)
        .setHighlight({ color: '#fef08a' }) // Yellow highlight
        .run();
      
      // Scroll into view
      setTimeout(() => {
        const dom = editor.view.domAtPos(highlightRange.from);
        if (dom.node && dom.node instanceof HTMLElement) {
          dom.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [editor, highlightRange]);

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
      {editable && <TableBubbleMenu editor={editor} />}
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
