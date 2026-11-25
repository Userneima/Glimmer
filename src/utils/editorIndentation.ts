import type { Editor } from '@tiptap/core';

const isInsideListItem = (editor: Editor) => {
  const { $from } = editor.state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const nodeName = $from.node(depth).type.name;
    if (nodeName === 'taskItem' || nodeName === 'listItem') {
      return true;
    }
  }

  return false;
};

const insertLeadingSpaces = (editor: Editor) => {
  const { state, dispatch } = editor.view;
  const { $from } = state.selection;
  const position = $from.start($from.depth);
  const isAtDocumentStart = position === 0;
  const hasContentAfter = position < state.doc.nodeSize - 2;

  if (!isAtDocumentStart || (isAtDocumentStart && hasContentAfter)) {
    dispatch(state.tr.insertText('  ', position, position));
    editor.view.focus();
  }

  return true;
};

const removeLeadingSpaces = (editor: Editor) => {
  const { state, dispatch } = editor.view;
  const { $from } = state.selection;
  const position = $from.start($from.depth);

  if (position < state.doc.nodeSize - 2) {
    const text = state.doc.textBetween(position, position + 2);
    if (text === '  ') {
      dispatch(state.tr.delete(position, position + 2));
      editor.view.focus();
      return true;
    }
    if (text === '\t') {
      dispatch(state.tr.delete(position, position + 1));
      editor.view.focus();
      return true;
    }
  }

  editor.view.focus();
  return true;
};

export const indentEditorSelection = (editor: Editor) => {
  const handledTaskItem = editor.chain().focus().sinkListItem('taskItem').run();
  if (handledTaskItem) return true;

  const handledListItem = editor.chain().focus().sinkListItem('listItem').run();
  if (handledListItem) return true;

  if (isInsideListItem(editor)) {
    editor.view.focus();
    return true;
  }

  return insertLeadingSpaces(editor);
};

export const outdentEditorSelection = (editor: Editor) => {
  const handledTaskItem = editor.chain().focus().liftListItem('taskItem').run();
  if (handledTaskItem) return true;

  const handledListItem = editor.chain().focus().liftListItem('listItem').run();
  if (handledListItem) return true;

  if (isInsideListItem(editor)) {
    editor.view.focus();
    return true;
  }

  return removeLeadingSpaces(editor);
};
