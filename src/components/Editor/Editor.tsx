import React, { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent, type Editor as TiptapEditor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin, TextSelection } from 'prosemirror-state';
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
import { AdaptiveInk } from './AdaptiveInk';
import { EditorToolbar } from './EditorToolbar';
import { TextBubbleMenu } from './TextBubbleMenu';
import { isLikelyMarkdown, isPlainTextHtml, markdownToHtml } from '../../utils/markdown';
import { indentEditorSelection, outdentEditorSelection } from '../../utils/editorIndentation';
import { createTaskItemNodeView } from './taskItemMark';

const getClipboardImageFiles = (clipboardData: DataTransfer | null): File[] => {
  if (!clipboardData) return [];

  const filesFromItems = Array.from(clipboardData.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  const filesFromFiles = Array.from(clipboardData.files ?? [])
    .filter((file) => file.type.startsWith('image/'));

  const seen = new Set<string>();
  return [...filesFromItems, ...filesFromFiles].filter((file) => {
    const key = `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const readFileAsDataUrl = (file: File): Promise<string> => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Failed to read pasted image.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read pasted image.'));
    reader.readAsDataURL(file);
  })
);

const TASK_COMPLETION_META = 'taskCompletion';

// What ticking a task does, in one place because both halves rewrite the same
// positions: every unfinished sub-task under it is ticked too, and the task
// then drops to the bottom of the list it lives in, so what is still open stays
// together at the top. A sub-task travels inside its parent rather than moving
// on its own, and unticking leaves the task where it sits.
const CompletedTaskBehavior = Extension.create({
  name: 'completedTaskBehavior',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, oldState, newState) => {
          if (transactions.some((transaction) => transaction.getMeta(TASK_COMPLETION_META))) {
            return null;
          }

          if (!transactions.some((transaction) => (
            transaction.docChanged && !transaction.getMeta('preventUpdate')
          ))) {
            return null;
          }

          // Ticking only rewrites attributes. Anything that resized the
          // document is typing, and comparing positions across it would be
          // reading the wrong nodes.
          if (oldState.doc.content.size !== newState.doc.content.size) {
            return null;
          }

          let target: number | null = null;
          newState.doc.descendants((node, position) => {
            if (target !== null) return false;
            if (node.type.name !== 'taskItem' || node.attrs.checked !== true) return;

            const previous = oldState.doc.nodeAt(position);
            if (previous?.type.name === 'taskItem' && previous.attrs.checked !== true) {
              target = position;
              return false;
            }
            return;
          });

          if (target === null) return null;

          const itemPosition: number = target;
          const item = newState.doc.nodeAt(itemPosition);
          if (!item) return null;

          const transaction = newState.tr;
          let changed = false;

          item.descendants((child, relativePosition) => {
            if (child.type.name !== 'taskItem' || child.attrs.checked === true) return;
            transaction.setNodeMarkup(itemPosition + 1 + relativePosition, undefined, {
              ...child.attrs,
              checked: true,
            });
            changed = true;
          });

          // Attribute edits leave every position intact, so the item can be
          // read back from the same transaction and then moved.
          const $item = newState.doc.resolve(itemPosition);
          const listEnd = $item.end();
          const itemEnd = itemPosition + item.nodeSize;

          if ($item.parent.type.name === 'taskList' && itemEnd < listEnd) {
            const moved = transaction.doc.nodeAt(itemPosition);
            if (moved) {
              transaction.delete(itemPosition, itemEnd);
              transaction.insert(transaction.mapping.map(listEnd), moved);
              changed = true;
            }
          }

          if (!changed) return null;

          transaction.setMeta(TASK_COMPLETION_META, true);
          return transaction;
        },
      }),
    ];
  },
});

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  editable?: boolean;
  highlightRange?: { from: number; to: number };
  /**
   * 手机上传 true：编辑器不自带滚动框，正文直接撑开，交给外层页面一起滚。
   * 键盘弹起后可见区域只剩几百像素，标题和提示条若固定不动，正文滚动框会被挤到几乎没有。
   */
  scrollWithPage?: boolean;
}

export const Editor: React.FC<EditorProps> = ({
  content,
  onChange,
  editable = true,
  highlightRange,
  scrollWithPage = false,
}) => {
  const CustomTaskItem = useMemo(
    () =>
      TaskItem.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            // 旧正文里参与过结转的条目带着 data-task-id。独立任务系统已下线，
            // 但属性留在 schema 里：不留的话 TipTap 解析时会把它从正文里抹掉。
            taskId: {
              default: null,
              parseHTML: (element) => element.getAttribute('data-task-id'),
              renderHTML: (attributes) =>
                attributes.taskId ? { 'data-task-id': attributes.taskId } : {},
            },
            // 打叉只是「已完成」的另一种样子：checked 仍然是完成与否的唯一判断，
            // 这里多记一个 dropped。拆行和新建的空行都不继承它。
            markState: {
              default: null,
              keepOnSplit: false,
              parseHTML: (element) => (
                element.getAttribute('data-checked') === 'true'
                && element.getAttribute('data-state') === 'dropped'
                  ? 'dropped'
                  : null
              ),
              renderHTML: (attributes) => (
                attributes.markState === 'dropped' ? { 'data-state': 'dropped' } : {}
              ),
            },
          };
        },
        addNodeView() {
          return createTaskItemNodeView;
        },
        addKeyboardShortcuts() {
          const inherited = this.parent?.() ?? {};
          // Declining by returning false would hand Return to the paragraph
          // handler, which starts a second line inside the task instead of a
          // new task. Every case this does not own goes back to the list split.
          const splitTask = () => (
            typeof inherited.Enter === 'function' ? inherited.Enter({ editor: this.editor }) : false
          );

          return {
            ...inherited,
            // Return with the caret at the very start of a task opens a blank
            // task above it. The default split hands the caret's item the old
            // checkbox state, so doing this on a finished task used to tick the
            // new blank line and mark the finished one undone.
            Enter: () => {
              const { state } = this.editor;
              const { selection } = state;

              if (!(selection instanceof TextSelection) || !selection.empty) {
                return splitTask();
              }

              const { $from } = selection;
              if ($from.parentOffset !== 0) {
                return splitTask();
              }

              let itemDepth = -1;
              for (let depth = $from.depth; depth > 0; depth -= 1) {
                if ($from.node(depth).type.name === this.name) {
                  itemDepth = depth;
                  break;
                }
              }

              if (itemDepth === -1) {
                return splitTask();
              }

              const item = $from.node(itemDepth);
              // An empty task still belongs to the default handler, which lifts
              // it out of the list.
              if (item.textContent.length === 0) {
                return splitTask();
              }

              const blank = item.type.createAndFill({ ...item.attrs, checked: false, markState: null });
              if (!blank) {
                return splitTask();
              }

              return this.editor
                .chain()
                .command(({ tr, dispatch }) => {
                  if (dispatch) {
                    tr.insert($from.before(itemDepth), blank);
                  }
                  return true;
                })
                .run();
            },
          };
        },
      }).configure({
        nested: true,
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
    // 表格只保留四个基础节点：不再支持新建，但正文里已经存在的表格要能
    // 照常渲染。去掉任何一项，TipTap 解析旧正文时都会把 <table> 静默丢掉。
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    CustomTaskItem,
    CompletedTaskBehavior,
    Highlight.configure({
      multicolor: true,
    }),
    TextStyle,
    Color,
    AdaptiveInk,
  ], [CustomTaskItem]);

  const editor: TiptapEditor | null = useEditor({
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
        const imageFiles = getClipboardImageFiles(event.clipboardData);

        if (imageFiles.length > 0) {
          event.preventDefault();
          void Promise.all(imageFiles.map(readFileAsDataUrl))
            .then((urls) => {
              editor?.chain().focus().insertContent(
                urls.map((src) => ({
                  type: 'image',
                  attrs: { src },
                }))
              ).run();
            })
            .catch((err) => {
              console.warn('Failed to insert pasted image', err);
            });
          return true;
        }

        const plainText = event.clipboardData?.getData('text/plain') ?? '';
        const htmlText = event.clipboardData?.getData('text/html') ?? '';

        if (!plainText.trim() || !isPlainTextHtml(htmlText) || !isLikelyMarkdown(plainText)) {
          return false;
        }

        event.preventDefault();
        editor?.chain().focus().insertContent(markdownToHtml(plainText)).run();
        return true;
      },
      handleKeyDown: (_view, event): boolean => {
        if (event.key === 'Tab') {
          event.preventDefault();
          return editor
            ? event.shiftKey
              ? outdentEditorSelection(editor)
              : indentEditorSelection(editor)
            : true;
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

  // 外部正文变化（切日记、任务迁移重写）在这里整篇替换。
  // 注意不要给这次替换加 addToHistory: false 来「避免占撤销点」：整篇 replaceWith
  // 之后，撤销栈里已有事件的位置会全部失效，Ctrl+Z 会变成哑操作（实测 undo 返回
  // true 但内容不动）。撤销栈的跨日记隔离改由 AppLayout 上 <Editor> 的 key 完成。
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
    <div className={scrollWithPage ? 'flex min-h-full flex-col' : 'flex flex-col h-full'} style={{ backgroundColor: 'var(--glimmer-editor-bg)' }} ref={editorContentRef}>
      {editable && (
        <EditorToolbar editor={editor} />
      )}
      {editable && <TextBubbleMenu editor={editor} />}
      <div className={scrollWithPage ? 'flex flex-1' : 'flex-1 overflow-hidden flex'}>
        <div className={scrollWithPage ? 'flex-1' : 'flex-1 overflow-y-auto'} style={{ 
          WebkitUserSelect: 'text',
          userSelect: 'text',
          touchAction: 'pan-x pan-y',
          pointerEvents: 'auto'
        }}>
          <EditorContent editor={editor} className="h-full" />
        </div>
      </div>
    </div>
  );
};
