export type LongTermFocusItem = {
  name: string;
  next: string | null;
};

// 「长期任务」文档里标题含这几个字的那一节，就是顶部横栏要显示的清单。
export const LONG_TERM_FOCUS_HEADING = '长期在做';

const NEXT_PREFIX = /^下一步\s*[:：]?\s*/;

const ownText = (li: Element) => {
  // 只取这一项自己的文字，不带下面嵌套的子项。
  const parts: string[] = [];
  li.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && ['UL', 'OL'].includes((node as Element).tagName)) return;
    parts.push(node.textContent ?? '');
  });
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

const parseItem = (li: Element): LongTermFocusItem | null => {
  // 勾掉的事不再显示。
  if (li.getAttribute('data-checked') === 'true') return null;
  let name = ownText(li);
  let next: string | null = null;

  li.querySelectorAll(':scope > ul > li, :scope > ol > li').forEach((child) => {
    if (next !== null) return;
    const text = ownText(child);
    if (NEXT_PREFIX.test(text)) next = text.replace(NEXT_PREFIX, '').trim() || null;
  });

  // 也认写在同一行里的「名字；下一步：…」。前面要有标点或空格隔开，「没有下一步的事」这种句子不拆。
  if (next === null) {
    const inline = name.match(/^(.+?)[，,；;。\s]+下一步\s*[:：]?\s*(.+)$/);
    if (inline) {
      name = inline[1].trim();
      next = inline[2].trim();
    }
  }

  if (!name) return null;
  return { name, next };
};

const listItems = (list: Element) =>
  Array.from(list.querySelectorAll(':scope > li'))
    .map(parseItem)
    .filter((item): item is LongTermFocusItem => item !== null);

export const parseLongTermFocus = (html: string): LongTermFocusItem[] => {
  if (!html || !(html.includes(LONG_TERM_FOCUS_HEADING) || html.includes('下一步'))) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = Array.from(doc.body.children);
  const start = blocks.findIndex(
    (el) => /^H[1-6]$/.test(el.tagName) && (el.textContent ?? '').includes(LONG_TERM_FOCUS_HEADING),
  );

  // 没写「长期在做」标题时，文档里每个写了「下一步」的顶层列表项都算一件长期的事。
  // 复制粘贴时标题行很容易丢，不能因为少一个标题整栏就不显示。
  if (start < 0) {
    return blocks
      .filter((el) => el.tagName === 'UL' || el.tagName === 'OL')
      .flatMap(listItems)
      .filter((item) => item.next !== null);
  }

  const level = Number(blocks[start].tagName[1]);
  const items: LongTermFocusItem[] = [];
  for (const el of blocks.slice(start + 1)) {
    // 到下一个同级或更高的标题为止。
    if (/^H[1-6]$/.test(el.tagName) && Number(el.tagName[1]) <= level) break;
    if (el.tagName === 'UL' || el.tagName === 'OL') items.push(...listItems(el));
  }
  return items;
};
