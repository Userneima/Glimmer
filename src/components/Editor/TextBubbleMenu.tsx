import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Palette, Link as LinkIcon } from 'lucide-react';
import { NodeSelection } from 'prosemirror-state';
import { ColorPicker } from '../UI/ColorPicker';
import { t } from '../../i18n';

interface TextBubbleMenuProps {
  editor: Editor;
}

type MenuPosition = {
  top: number;
  left: number;
};

type BubbleButtonProps = {
  onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isActive?: boolean;
  title: string;
  children: React.ReactNode;
};

const BubbleButton: React.FC<BubbleButtonProps> = ({ onMouseDown, isActive, title, children }) => (
  <button
    type="button"
    onMouseDown={onMouseDown}
    title={title}
    className={`p-2 rounded-apple-sm transition-all duration-200 active:scale-95 ${
      isActive ? 'bg-accent-100 text-accent-600' : 'text-primary-600 hover:bg-primary-100'
    }`}
  >
    {children}
  </button>
);

export const TextBubbleMenu: React.FC<TextBubbleMenuProps> = ({ editor }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isImageMode, setIsImageMode] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0 });
  const [showColorPicker, setShowColorPicker] = useState(false);
  
  // 保存选区状态
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);

  const updateMenuState = useCallback(() => {
    const { selection } = editor.state;

    if (editor.isActive('table')) {
      setIsVisible(false);
      return;
    }

    // If an image node is active/selected, show image controls anchored to the image
    if (editor.isActive('image')) {
      try {
        const pos = selection.from;
        // nodeDOM gives the DOM node for a document position
        const domNode = (editor.view as any).nodeDOM(pos) as HTMLElement | null;
        let imgEl: HTMLElement | null = null;
        if (domNode) {
          if (domNode.nodeName === 'IMG') {
            imgEl = domNode;
          } else {
            imgEl = domNode.querySelector && domNode.querySelector('img');
          }
        }

        if (imgEl) {
          const rect = imgEl.getBoundingClientRect();
          const top = rect.top + window.scrollY - 44;
          const left = rect.left + window.scrollX + rect.width / 2;
          setPosition({ top, left });
          setIsImageMode(true);
          setIsVisible(true);
          return;
        }
      } catch (e) {
        // fallthrough to text selection behavior
      }
    }

    setIsImageMode(false);

    if (selection.empty || !editor.isFocused) {
      setIsVisible(false);
      return;
    }

    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
      setIsVisible(false);
      return;
    }

    const range = domSelection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      setIsVisible(false);
      return;
    }

    const top = rect.top + window.scrollY - 52;
    const left = rect.left + window.scrollX + rect.width / 2;

    setPosition({ top, left });
    setIsVisible(true);
  }, [editor]);

  useEffect(() => {
    const handleUpdate = () => {
      requestAnimationFrame(updateMenuState);
    };

    const handleBlur = () => {
      setIsVisible(false);
    };

    editor.on('selectionUpdate', handleUpdate);
    editor.on('transaction', handleUpdate);
    editor.on('focus', handleUpdate);
    editor.on('blur', handleBlur);

    return () => {
      editor.off('selectionUpdate', handleUpdate);
      editor.off('transaction', handleUpdate);
      editor.off('focus', handleUpdate);
      editor.off('blur', handleBlur);
    };
  }, [editor, updateMenuState]);

  const handleAction = useCallback(
    (action: () => void) => (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      action();
    },
    []
  );

  const addLink = useCallback(() => {
    const url = window.prompt(t('Enter URL:'));
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const setImageWidth = useCallback((widthValue: string | null) => {
    // widthValue like '50%' or null to reset
    if (!editor) return;
    // try updateAttributes; fallback to setImage on the currently selected node
    try {
      editor.chain().focus().updateAttributes('image', widthValue ? { style: `width: ${widthValue};` } : { style: null, width: null }).run();
    } catch (e) {
      // best-effort: replace node with same src and new attrs
      const { selection } = editor.state;
      const node = selection instanceof NodeSelection ? selection.node : null;
      if (node && node.type && node.type.name === 'image') {
        const src = node.attrs.src;
        const attrs: any = { src };
        if (widthValue) attrs.style = `width: ${widthValue};`;
        editor.chain().focus().setImage(attrs).run();
      }
    }
  }, [editor]);

  if (!isVisible) {
    return (
      <>
        {showColorPicker && (
          <ColorPicker
            onColorSelect={(color) => {
              // 恢复保存的选区并应用颜色
              if (savedSelectionRef.current) {
                const { from, to } = savedSelectionRef.current;
                editor
                  .chain()
                  .focus()
                  .setTextSelection({ from, to })
                  .setColor(color)
                  .run();
              } else {
                editor.chain().focus().setColor(color).run();
              }
            }}
            onClose={() => {
              setShowColorPicker(false);
              savedSelectionRef.current = null;
            }}
          />
        )}
      </>
    );
  }
  return (
    <>
      <div
        className="fixed z-50 -translate-x-1/2 bg-white/95 backdrop-blur-apple border border-primary-200 rounded-apple-lg shadow-apple-lg p-1.5 flex items-center gap-1"
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
      >
        {isImageMode ? (
          // Image sizing controls
          <>
            <BubbleButton onMouseDown={handleAction(() => setImageWidth('25%'))} title={t('Image 25%')}>25%</BubbleButton>
            <BubbleButton onMouseDown={handleAction(() => setImageWidth('50%'))} title={t('Image 50%')}>50%</BubbleButton>
            <BubbleButton onMouseDown={handleAction(() => setImageWidth('75%'))} title={t('Image 75%')}>75%</BubbleButton>
            <BubbleButton onMouseDown={handleAction(() => setImageWidth('100%'))} title={t('Image 100%')}>Full</BubbleButton>
            <BubbleButton onMouseDown={handleAction(() => setImageWidth(null))} title={t('Reset Image Size')}>Reset</BubbleButton>
          </>
        ) : (
          // Text formatting controls
          <>
            <BubbleButton
              onMouseDown={handleAction(() => editor.chain().focus().toggleBold().run())}
              isActive={editor.isActive('bold')}
              title={t('Bold')}
            >
              <Bold size={16} strokeWidth={1.75} />
            </BubbleButton>
            <BubbleButton
              onMouseDown={handleAction(() => editor.chain().focus().toggleItalic().run())}
              isActive={editor.isActive('italic')}
              title={t('Italic')}
            >
              <Italic size={16} strokeWidth={1.75} />
            </BubbleButton>
            <BubbleButton
              onMouseDown={handleAction(() => editor.chain().focus().toggleUnderline().run())}
              isActive={editor.isActive('underline')}
              title={t('Underline')}
            >
              <UnderlineIcon size={16} strokeWidth={1.75} />
            </BubbleButton>
            <BubbleButton
              onMouseDown={handleAction(() => editor.chain().focus().toggleStrike().run())}
              isActive={editor.isActive('strike')}
              title={t('Strikethrough')}
            >
              <Strikethrough size={16} strokeWidth={1.75} />
            </BubbleButton>
            <BubbleButton
              onMouseDown={handleAction(() => editor.chain().focus().toggleCode().run())}
              isActive={editor.isActive('code')}
              title={t('Code')}
            >
              <Code size={16} strokeWidth={1.75} />
            </BubbleButton>
            <BubbleButton
              onMouseDown={handleAction(addLink)}
              isActive={editor.isActive('link')}
              title={t('Add Link')}
            >
              <LinkIcon size={16} strokeWidth={1.75} />
            </BubbleButton>
            <BubbleButton
              onMouseDown={handleAction(() => {
                // 保存当前选区
                const { from, to } = editor.state.selection;
                savedSelectionRef.current = { from, to };
                setShowColorPicker(true);
              })}
              title={t('Text Color')}
            >
              <Palette size={16} strokeWidth={1.75} />
            </BubbleButton>
          </>
        )}
      </div>

      {showColorPicker && (
        <ColorPicker
          onColorSelect={(color) => {
            // 恢复保存的选区并应用颜色
            if (savedSelectionRef.current) {
              const { from, to } = savedSelectionRef.current;
              editor
                .chain()
                .focus()
                .setTextSelection({ from, to })
                .setColor(color)
                .run();
            } else {
              editor.chain().focus().setColor(color).run();
            }
          }}
          onClose={() => {
            setShowColorPicker(false);
            savedSelectionRef.current = null;
          }}
        />
      )}
    </>
  );
};
