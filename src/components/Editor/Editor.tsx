import React, { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { AllSelection, Plugin, TextSelection } from 'prosemirror-state';
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
import { isLikelyMarkdown, markdownToHtml } from '../../utils/markdown';

const CascadeTaskCompletion = Extension.create({
  name: 'cascadeTaskCompletion',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, oldState, newState) => {
          const userChangedTaskState = transactions.some((transaction) => {
            if (!transaction.docChanged || transaction.getMeta('preventUpdate')) {
              return false;
            }

            return transaction.steps.some((step) => {
              const json = step.toJSON() as {
                stepType?: string;
                attr?: string;
                value?: unknown;
                newAttrs?: Record<string, unknown>;
              };
              return (
                (json.stepType === 'attr' && json.attr === 'checked' && json.value === true) ||
                json.newAttrs?.checked === true
              );
            });
          });

          if (!userChangedTaskState) {
            return null;
          }

          let transaction = newState.tr;
          let hasNestedChanges = false;

          newState.doc.descendants((node, position) => {
            if (node.type.name !== 'taskItem' || node.attrs.checked !== true) {
              return;
            }

            if (position > oldState.doc.content.size) {
              return false;
            }

            let oldNode = null;
            try {
              oldNode = oldState.doc.nodeAt(position);
            } catch {
              return false;
            }

            const becameChecked =
              oldNode?.type.name === 'taskItem' &&
              oldNode.attrs.checked !== true &&
              node.attrs.checked === true;

            if (!becameChecked) {
              return;
            }

            node.descendants((childNode, relativePosition) => {
              if (childNode.type.name !== 'taskItem' || childNode.attrs.checked === true) {
                return;
              }

              const childPosition = position + 1 + relativePosition;
              if (childPosition > newState.doc.content.size) {
                return;
              }

              transaction = transaction.setNodeMarkup(childPosition, undefined, {
                ...childNode.attrs,
                checked: true,
              });
              hasNestedChanges = true;
            });
          });

          return hasNestedChanges ? transaction : null;
        },
      }),
    ];
  },
});

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  editable?: boolean;
  contentRightPanel?: React.ReactNode;
  highlightRange?: { from: number; to: number };
}

export const Editor: React.FC<EditorProps> = ({
  content,
  onChange,
  editable = true,
  contentRightPanel,
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
    CascadeTaskCompletion,
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
      handlePaste: (_view, event) => {
        const plainText = event.clipboardData?.getData('text/plain') ?? '';
        const htmlText = event.clipboardData?.getData('text/html') ?? '';

        if (!plainText.trim() || htmlText.trim() || !isLikelyMarkdown(plainText)) {
          return false;
        }

        event.preventDefault();
        editor?.chain().focus().insertContent(markdownToHtml(plainText)).run();
        return true;
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

          if (editor) {
            if (editor.isActive('taskItem')) {
              const handled = event.shiftKey
                ? editor.chain().focus().liftListItem('taskItem').run()
                : editor.chain().focus().sinkListItem('taskItem').run();

              if (handled) {
                return true;
              }
            }

            if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
              const handled = event.shiftKey
                ? editor.chain().focus().liftListItem('listItem').run()
                : editor.chain().focus().sinkListItem('listItem').run();

              if (handled) {
                return true;
              }
            }
          }

          // Find the start position of the current paragraph/block node
          const position = $from.start($from.depth);

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
      handleDOMEvents: {},
    },
  });

  const editorContentRef = useRef<HTMLDivElement>(null);

  // Highlight range effect
  useEffect(() => {
    if (editor && highlightRange) {
      const maxPosition = editor.state.doc.content.size;
      if (
        highlightRange.from < 0 ||
        highlightRange.to < highlightRange.from ||
        highlightRange.from > maxPosition
      ) {
        return;
      }

      const safeRange = {
        from: highlightRange.from,
        to: Math.min(highlightRange.to, maxPosition),
      };

      try {
        editor.commands.setTextSelection(safeRange.from);

        editor.chain()
          .focus()
          .setTextSelection(safeRange)
          .setHighlight({ color: '#fef08a' })
          .run();

        window.setTimeout(() => {
          try {
            const dom = editor.view.domAtPos(safeRange.from);
            if (dom.node && dom.node instanceof HTMLElement) {
              dom.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          } catch (err) {
            console.warn('Failed to scroll highlighted diary range', err);
          }
        }, 100);
      } catch (err) {
        console.warn('Failed to apply diary highlight range', err);
      }
    }
  }, [editor, highlightRange]);

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
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
      {editable && (
        <EditorToolbar editor={editor} />
      )}
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
