import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Palette, Link as LinkIcon, RotateCcw } from 'lucide-react';
import { NodeSelection } from 'prosemirror-state';
import { ColorPicker, type ColorPickerAnchor } from '../UI/ColorPicker';
import { t } from '../../i18n';
import { adaptInk } from '../../utils/inkColor';

interface TextBubbleMenuProps {
  editor: Editor;
}

type MenuPosition = {
  top: number;
  left: number;
};

type ImageAttrs = {
  src: string;
  style?: string;
};

const parseImageWidthPercent = (style: unknown): number => {
  if (typeof style !== 'string') return 100;
  const match = style.match(/width:\s*(\d+(?:\.\d+)?)%/i);
  if (!match) return 100;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(10, Math.round(value)));
};

type BubbleButtonProps = {
  onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isActive?: boolean;
  title: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onMouseDown' | 'title' | 'children' | 'className'>;

const BubbleButton: React.FC<BubbleButtonProps> = ({ onMouseDown, isActive, title, children, ...rest }) => (
  <button
    type="button"
    onMouseDown={onMouseDown}
    title={title}
    {...rest}
    className={`p-2 rounded-apple-sm transition-all duration-200 active:scale-95 ${
      isActive ? 'bg-accent-100 text-accent-600' : 'text-primary-600 hover:bg-primary-100'
    }`}
  >
    {children}
  </button>
);

// The theme lives on the root element; the bubble menu only needs to know
// which half of the pair is on screen right now.
const isDarkTheme = () =>
  typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';

export const TextBubbleMenu: React.FC<TextBubbleMenuProps> = ({ editor }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isImageMode, setIsImageMode] = useState(false);
  const [imageWidthPercent, setImageWidthPercent] = useState(100);
  const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0 });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorAnchor, setColorAnchor] = useState<ColorPickerAnchor | null>(null);
  const [currentColor, setCurrentColor] = useState<string | null>(null);
  
  // 保存选区状态
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const menuMouseDownRef = useRef(false);

  /** Returns false when the saved selection was unusable and nothing ran. */
  const restoreSelectionAndRun = useCallback((action: () => void): boolean => {
    try {
      const savedSelection = savedSelectionRef.current;
      if (savedSelection) {
        const maxPosition = editor.state.doc.content.size;
        if (
          savedSelection.from < 0 ||
          savedSelection.to < savedSelection.from ||
          savedSelection.from > maxPosition
        ) {
          savedSelectionRef.current = null;
          return false;
        }

        editor
          .chain()
          .focus()
          .setTextSelection({
            from: savedSelection.from,
            to: Math.min(savedSelection.to, maxPosition),
          })
          .run();
      }

      action();
      return true;
    } catch (err) {
      console.warn('Failed to restore editor selection', err);
      savedSelectionRef.current = null;
      return false;
    }
  }, [editor]);

  const updateMenuState = useCallback(() => {
    try {
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
          const domNode = editor.view.nodeDOM(pos);
          let imgEl: HTMLElement | null = null;
          if (domNode instanceof HTMLElement) {
            if (domNode.nodeName === 'IMG') {
              imgEl = domNode;
            } else {
              imgEl = domNode.querySelector('img');
            }
          }

          if (imgEl) {
            const rect = imgEl.getBoundingClientRect();
            const top = rect.top + window.scrollY - 44;
            const left = rect.left + window.scrollX + rect.width / 2;
            setImageWidthPercent(parseImageWidthPercent(imgEl.getAttribute('style')));
            setPosition({ top, left });
            setIsImageMode(true);
            setIsVisible(true);
            return;
          }
        } catch {
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
    } catch (err) {
      console.warn('Failed to update editor bubble menu', err);
      setIsVisible(false);
    }
  }, [editor]);

  useEffect(() => {
    const handleUpdate = () => {
      requestAnimationFrame(updateMenuState);
    };

    const handleBlur = () => {
      if (menuMouseDownRef.current) {
        window.setTimeout(() => {
          menuMouseDownRef.current = false;
          updateMenuState();
        }, 0);
        return;
      }

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
    } catch {
      // best-effort: replace node with same src and new attrs
      const { selection } = editor.state;
      const node = selection instanceof NodeSelection ? selection.node : null;
      if (node && node.type && node.type.name === 'image') {
        const attrs: ImageAttrs = { src: String(node.attrs.src ?? '') };
        if (widthValue) attrs.style = `width: ${widthValue};`;
        editor.chain().focus().setImage(attrs).run();
      }
    }
  }, [editor]);

  const handleImageWidthChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextWidth = Number(event.target.value);
    if (!Number.isFinite(nextWidth)) return;
    setImageWidthPercent(nextWidth);
    setImageWidth(`${nextWidth}%`);
  }, [setImageWidth]);

  const closeColorPicker = useCallback(() => {
    setShowColorPicker(false);
    savedSelectionRef.current = null;
  }, []);

  // Whatever he picks is stored as a pair, so the same run of text stays
  // readable after he switches theme. The inline colour is the light-mode half.
  const applyColor = useCallback((color: string) => {
    const ink = adaptInk(color) ?? { light: color, dark: color };
    const applied = restoreSelectionAndRun(() => editor
      .chain()
      .focus()
      .setMark('textStyle', { color: ink.light, darkInk: ink.dark })
      .run());
    if (applied) {
      setCurrentColor(isDarkTheme() ? ink.dark : ink.light);
    }
  }, [editor, restoreSelectionAndRun]);

  const clearColor = useCallback(() => {
    // Drops the whole textStyle mark: colour and its dark twin are the only
    // things on it, and unsetting them one by one leaves an empty span behind.
    const cleared = restoreSelectionAndRun(() => editor
      .chain()
      .focus()
      .unsetMark('textStyle')
      .run());
    if (cleared) {
      setCurrentColor(null);
    }
  }, [editor, restoreSelectionAndRun]);

  const handleColorMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (showColorPicker) {
      closeColorPicker();
      return;
    }
    const { from, to } = editor.state.selection;
    savedSelectionRef.current = { from, to };
    const rect = event.currentTarget.getBoundingClientRect();
    setColorAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 });
    // Show the half he is actually looking at, or the picker would tick a
    // swatch that does not match the text on screen.
    const textStyle = editor.getAttributes('textStyle');
    const activeColor = isDarkTheme()
      ? textStyle?.darkInk ?? textStyle?.color
      : textStyle?.color;
    setCurrentColor(typeof activeColor === 'string' ? activeColor : null);
    setShowColorPicker(true);
  }, [closeColorPicker, editor, showColorPicker]);

  const colorPickerNode = showColorPicker && colorAnchor ? (
    <ColorPicker
      anchor={colorAnchor}
      currentColor={currentColor}
      onColorSelect={applyColor}
      onClearColor={clearColor}
      onClose={closeColorPicker}
    />
  ) : null;

  return (
    <>
      {isVisible && (
        <div
          className="glimmer-panel fixed z-50 -translate-x-1/2 backdrop-blur-apple border rounded-apple-lg shadow-apple-lg p-1.5 flex items-center gap-1"
          style={{ top: `${position.top}px`, left: `${position.left}px` }}
          onMouseDownCapture={() => {
            menuMouseDownRef.current = true;
          }}
        >
          {isImageMode ? (
            // Image sizing controls
            <div className="flex items-center gap-2 px-2 py-1">
              <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--aurora-secondary)' }}>
                {imageWidthPercent}%
              </span>
              <input
                aria-label={t('Image Width')}
                title={t('Image Width')}
                type="range"
                min="10"
                max="100"
                step="1"
                value={imageWidthPercent}
                onChange={handleImageWidthChange}
                className="h-2 w-36 cursor-pointer accent-sky-500"
              />
              <BubbleButton
                onMouseDown={handleAction(() => {
                  setImageWidthPercent(100);
                  setImageWidth(null);
                })}
                title={t('Reset Image Size')}
              >
                <RotateCcw size={15} strokeWidth={1.8} />
              </BubbleButton>
            </div>
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
                onMouseDown={handleColorMouseDown}
                isActive={showColorPicker}
                title={t('Text Color')}
                data-color-trigger=""
              >
                <Palette size={16} strokeWidth={1.75} />
              </BubbleButton>
            </>
          )}
        </div>
      )}

      {colorPickerNode}
    </>
  );
};
