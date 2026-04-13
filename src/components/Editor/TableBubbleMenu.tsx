import React, { useCallback, useEffect, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Columns2,
  Rows2,
  Plus,
  Trash2,
  Heading,
  SquareSplitHorizontal,
  TableProperties,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
} from 'lucide-react';
import { t } from '../../i18n';

interface TableBubbleMenuProps {
  editor: Editor;
}

type MenuPosition = {
  top: number;
  left: number;
};

type TableActionButtonProps = {
  onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
};

const TableActionButton: React.FC<TableActionButtonProps> = ({
  onMouseDown,
  title,
  children,
  disabled = false,
  danger = false,
  active = false,
}) => (
  <button
    type="button"
    onMouseDown={onMouseDown}
    title={title}
    disabled={disabled}
    className={`flex h-9 min-w-9 items-center justify-center rounded-xl border px-2.5 text-[13px] font-medium transition-all duration-200 ${
      active
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : danger
          ? 'border-red-200 text-red-600 hover:bg-red-50'
          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
    } disabled:cursor-not-allowed disabled:opacity-40`}
  >
    {children}
  </button>
);

const TableMenuSection: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center gap-1.5">
    <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
    <div className="flex items-center gap-1">{children}</div>
  </div>
);

export const TableBubbleMenu: React.FC<TableBubbleMenuProps> = ({ editor }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0 });
  const currentCellAttributes = editor.isActive('tableHeader')
    ? editor.getAttributes('tableHeader')
    : editor.getAttributes('tableCell');
  const currentTextAlign = currentCellAttributes.textAlign ?? 'left';
  const currentVerticalAlign = currentCellAttributes.verticalAlign ?? 'top';

  const updateMenuState = useCallback(() => {
    if (!editor.isEditable || !editor.isActive('table')) {
      setIsVisible(false);
      return;
    }

    const { from } = editor.state.selection;
    const domAtPos = editor.view.domAtPos(from);
    const anchorNode =
      domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;

    const cellElement = anchorNode?.closest('td, th');
    const tableWrapper = anchorNode?.closest('.tableWrapper');

    if (!cellElement || !tableWrapper) {
      setIsVisible(false);
      return;
    }

    const wrapperRect = tableWrapper.getBoundingClientRect();
    const desiredTop = wrapperRect.top + window.scrollY - 56;
    const desiredLeft = wrapperRect.left + window.scrollX + 12;

    setPosition({
      top: Math.max(16, desiredTop),
      left: desiredLeft,
    });
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

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="fixed z-50 flex max-w-[calc(100vw-32px)] flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur-xl"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <TableMenuSection label={t('Columns')}>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().addColumnBefore().run())}
          title={t('Insert Column Left')}
          disabled={!editor.can().addColumnBefore()}
        >
          <Columns2 size={15} strokeWidth={1.85} className="mr-1" />
          <Plus size={12} strokeWidth={2} />
        </TableActionButton>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().addColumnAfter().run())}
          title={t('Insert Column Right')}
          disabled={!editor.can().addColumnAfter()}
        >
          <Columns2 size={15} strokeWidth={1.85} className="mr-1" />
          <Plus size={12} strokeWidth={2} />
        </TableActionButton>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().deleteColumn().run())}
          title={t('Delete Column')}
          disabled={!editor.can().deleteColumn()}
          danger
        >
          <Trash2 size={15} strokeWidth={1.85} />
        </TableActionButton>
      </TableMenuSection>

      <TableMenuSection label={t('Rows')}>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().addRowBefore().run())}
          title={t('Insert Row Above')}
          disabled={!editor.can().addRowBefore()}
        >
          <Rows2 size={15} strokeWidth={1.85} className="mr-1" />
          <Plus size={12} strokeWidth={2} />
        </TableActionButton>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().addRowAfter().run())}
          title={t('Insert Row Below')}
          disabled={!editor.can().addRowAfter()}
        >
          <Rows2 size={15} strokeWidth={1.85} className="mr-1" />
          <Plus size={12} strokeWidth={2} />
        </TableActionButton>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().deleteRow().run())}
          title={t('Delete Row')}
          disabled={!editor.can().deleteRow()}
          danger
        >
          <Trash2 size={15} strokeWidth={1.85} />
        </TableActionButton>
      </TableMenuSection>

      <TableMenuSection label={t('Style')}>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().toggleHeaderRow().run())}
          title={t('Toggle Header Row')}
          disabled={!editor.can().toggleHeaderRow()}
        >
          <Heading size={15} strokeWidth={1.85} />
        </TableActionButton>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().toggleHeaderColumn().run())}
          title={t('Toggle Header Column')}
          disabled={!editor.can().toggleHeaderColumn()}
        >
          <TableProperties size={15} strokeWidth={1.85} />
        </TableActionButton>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().mergeOrSplit().run())}
          title={t('Merge or Split Cells')}
          disabled={!editor.can().mergeOrSplit()}
        >
          <SquareSplitHorizontal size={15} strokeWidth={1.85} />
        </TableActionButton>
      </TableMenuSection>

      <TableMenuSection label={t('Align')}>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().setCellAttribute('textAlign', 'left').run())}
          title={t('Align Left')}
          active={currentTextAlign === 'left'}
        >
          <AlignLeft size={15} strokeWidth={1.85} />
        </TableActionButton>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().setCellAttribute('textAlign', 'center').run())}
          title={t('Align Center')}
          active={currentTextAlign === 'center'}
        >
          <AlignCenter size={15} strokeWidth={1.85} />
        </TableActionButton>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().setCellAttribute('textAlign', 'right').run())}
          title={t('Align Right')}
          active={currentTextAlign === 'right'}
        >
          <AlignRight size={15} strokeWidth={1.85} />
        </TableActionButton>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().setCellAttribute('verticalAlign', 'top').run())}
          title={t('Align Top')}
          active={currentVerticalAlign === 'top'}
        >
          <AlignStartVertical size={15} strokeWidth={1.85} className="rotate-90" />
        </TableActionButton>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().setCellAttribute('verticalAlign', 'middle').run())}
          title={t('Align Middle')}
          active={currentVerticalAlign === 'middle'}
        >
          <AlignCenterVertical size={15} strokeWidth={1.85} className="rotate-90" />
        </TableActionButton>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().setCellAttribute('verticalAlign', 'bottom').run())}
          title={t('Align Bottom')}
          active={currentVerticalAlign === 'bottom'}
        >
          <AlignEndVertical size={15} strokeWidth={1.85} className="rotate-90" />
        </TableActionButton>
      </TableMenuSection>

      <TableMenuSection label={t('Table')}>
        <TableActionButton
          onMouseDown={handleAction(() => editor.chain().focus().deleteTable().run())}
          title={t('Delete Table')}
          disabled={!editor.can().deleteTable()}
          danger
        >
          <Trash2 size={15} strokeWidth={1.85} className="mr-1" />
          {t('Delete')}
        </TableActionButton>
      </TableMenuSection>
    </div>
  );
};
