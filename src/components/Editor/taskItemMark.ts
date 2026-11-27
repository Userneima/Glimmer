import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/**
 * 任务条目除「未勾 / 已勾」之外的第三种样子：打叉。
 *
 * 打叉不新增一种完成语义，它仍然记成 checked，只是多带 markState='dropped'。
 * 这样跨日挪移、长期在做、导出这些把 checked 当「已完成」的地方都不用改判断。
 */
export type TaskItemMark = 'dropped' | null;

/** 点一下的循环：未勾 → 打勾 → 打叉 → 未勾。 */
export const nextTaskItemMark = (
  checked: boolean,
  mark: TaskItemMark,
): { checked: boolean; markState: TaskItemMark } => {
  if (!checked) return { checked: true, markState: null };
  if (mark !== 'dropped') return { checked: true, markState: 'dropped' };
  return { checked: false, markState: null };
};

const CHECK_ICON = '<svg class="task-toggle-check" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.4 4.1 7.5 8 2.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS_ICON = '<svg class="task-toggle-cross" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.7 2.7 7.3 7.3 M7.3 2.7 2.7 7.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

const markLabel = (checked: boolean, dropped: boolean) => {
  if (dropped) return '已打叉，再点一下恢复未完成';
  if (checked) return '已完成，再点一下打叉';
  return '未完成，点一下打勾';
};

type TaskItemNodeViewOptions = {
  node: ProseMirrorNode;
  getPos: () => number | undefined;
  editor: Editor;
};

/**
 * 自绘任务勾选框：系统 checkbox 画不出叉，所以三种状态都由 CSS 和图标决定。
 * 点一下走一个 transaction，撤销、保存、跨日挪移读到的仍然是同一份节点属性。
 */
export const createTaskItemNodeView = ({ node, getPos, editor }: TaskItemNodeViewOptions) => {
  const itemType = node.type;
  const listItem = document.createElement('li');
  const toggle = document.createElement('button');
  const content = document.createElement('div');

  toggle.type = 'button';
  toggle.className = 'task-toggle';
  toggle.innerHTML = `${CHECK_ICON}${CROSS_ICON}`;
  listItem.append(toggle, content);

  const applyAttrs = (currentNode: ProseMirrorNode) => {
    const checked = currentNode.attrs.checked === true;
    const dropped = checked && currentNode.attrs.markState === 'dropped';

    listItem.dataset.checked = String(checked);
    if (dropped) listItem.dataset.state = 'dropped';
    else listItem.removeAttribute('data-state');

    const taskId = currentNode.attrs.taskId;
    if (taskId) listItem.setAttribute('data-task-id', String(taskId));
    else listItem.removeAttribute('data-task-id');

    toggle.classList.toggle('is-done', checked && !dropped);
    toggle.classList.toggle('is-dropped', dropped);
    toggle.setAttribute('aria-label', markLabel(checked, dropped));
  };

  const cycleMark = () => {
    if (!editor.isEditable || typeof getPos !== 'function') return;
    const position = getPos();
    if (typeof position !== 'number') return;

    editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .command(({ tr }) => {
        const currentNode = tr.doc.nodeAt(position);
        if (!currentNode || currentNode.type !== itemType) return false;
        tr.setNodeMarkup(position, undefined, {
          ...currentNode.attrs,
          ...nextTaskItemMark(currentNode.attrs.checked === true, currentNode.attrs.markState ?? null),
        });
        return true;
      })
      .run();
  };

  // 和 TipTap 自带的勾选框一样：按下不抢焦点、不打断正在编辑的正文。
  toggle.addEventListener('mousedown', (event) => event.preventDefault());
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    cycleMark();
  });

  applyAttrs(node);

  return {
    dom: listItem,
    contentDOM: content,
    update: (updatedNode: ProseMirrorNode) => {
      if (updatedNode.type !== itemType) return false;
      applyAttrs(updatedNode);
      return true;
    },
  };
};
