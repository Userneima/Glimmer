const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttribute = (value: string) => escapeHtml(value).replace(/`/g, '&#96;');

const parseInlineMarkdown = (value: string) => {
  const codeTokens: string[] = [];
  let text = escapeHtml(value);

  text = text.replace(/`([^`]+)`/g, (_, code: string) => {
    const token = `@@CODE_${codeTokens.length}@@`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });

  // 图片要先于链接处理，说明文字可以为空（Glimmer 自己导出的图片就是 ![](...)）。
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, url: string) => (
    `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}">`
  ));
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => (
    `<a href="${escapeAttribute(url)}">${label}</a>`
  ));
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

  codeTokens.forEach((html, index) => {
    text = text.replace(`@@CODE_${index}@@`, html);
  });

  return text;
};

const isTableDivider = (line: string) =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const isTableRow = (line: string) => line.includes('|') && !isTableDivider(line);

const splitTableRow = (line: string) => {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
};

// 从代码编辑器、聊天窗口的代码块、纯文本编辑器里复制时，剪贴板除了纯文本还会带一份 HTML，
// 但那份 HTML 只是把同样的 Markdown 原文包了一层（pre、code、span、div）。
// 这种情况仍按 Markdown 转换；HTML 里真有标题、列表、表格这类结构时，说明来源已经排好版，保留原样。
const STRUCTURED_HTML_TAGS = 'h1,h2,h3,h4,h5,h6,ul,ol,li,table,blockquote,img,a,strong,b,em,i,hr';

export const isPlainTextHtml = (html: string) => {
  if (!html.trim()) return true;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.querySelector(STRUCTURED_HTML_TAGS) === null;
};

export const isLikelyMarkdown = (value: string) => {
  const text = value.replace(/\r\n/g, '\n').trim();
  if (!text) return false;

  const lines = text.split('\n');
  const blockSignals = lines.filter((line) => (
    /^#{1,6}\s+\S/.test(line) ||
    /^>\s+\S/.test(line) ||
    /^\s*[-*+]\s+\[[ xX-]\]\s+\S/.test(line) ||
    /^\s*[-*+]\s+\S/.test(line) ||
    /^\s*\d+[.)]\s+\S/.test(line) ||
    /^```/.test(line) ||
    /^---+$/.test(line.trim()) ||
    isTableDivider(line)
  )).length;

  if (blockSignals > 0) return true;

  const inlineSignals = [
    /\*\*[^*\n]+\*\*/.test(text),
    /__[^_\n]+__/.test(text),
    /`[^`\n]+`/.test(text),
    /\[[^\]]+\]\([^)]+\)/.test(text),
  ].filter(Boolean).length;

  return inlineSignals >= 2;
};

export const markdownToHtml = (markdown: string) => {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  // 列表按原样的缩进和顺序收集，最后一起排成嵌套结构。以前普通列表、编号列表、待办
  // 各收一堆，混在一起时会被按类型重新分组，缩进也被忽略，子项跑到父项前面。
  type ListLine = { indent: number; kind: 'ul' | 'ol' | 'task'; checked: boolean; dropped: boolean; text: string };
  let listLines: ListLine[] = [];
  let quoteLines: string[] = [];
  let isInCodeBlock = false;
  let codeLines: string[] = [];
  let tableRows: string[][] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${paragraph.map(parseInlineMarkdown).join('<br/>')}</p>`);
    paragraph = [];
  };

  const renderItem = (line: ListLine, children: string) => {
    if (line.kind !== 'task') {
      return `<li><p>${parseInlineMarkdown(line.text)}</p>${children}</li>`;
    }
    const closed = line.checked || line.dropped;
    const state = line.dropped ? ' data-state="dropped"' : '';
    return `<li data-type="taskItem" data-checked="${closed ? 'true' : 'false'}"${state}><label><input type="checkbox"${closed ? ' checked' : ''}><span></span></label><div><p>${parseInlineMarkdown(line.text)}</p>${children}</div></li>`;
  };
  const openTag = (kind: ListLine['kind']) => (kind === 'ol' ? '<ol>' : kind === 'task' ? '<ul data-type="taskList">' : '<ul>');
  const closeTag = (kind: ListLine['kind']) => (kind === 'ol' ? '</ol>' : '</ul>');

  // 从 start 开始，渲染缩进不小于 indent 的那一段，返回 HTML 和下一个未处理的位置。
  const renderLists = (start: number, indent: number): [string, number] => {
    let out = '';
    let i = start;
    let currentKind: ListLine['kind'] | null = null;
    while (i < listLines.length && listLines[i].indent >= indent) {
      const line = listLines[i];
      if (line.kind !== currentKind) {
        if (currentKind) out += closeTag(currentKind);
        out += openTag(line.kind);
        currentKind = line.kind;
      }
      let children = '';
      let next = i + 1;
      if (next < listLines.length && listLines[next].indent > line.indent) {
        [children, next] = renderLists(next, listLines[next].indent);
      }
      out += renderItem(line, children);
      i = next;
    }
    if (currentKind) out += closeTag(currentKind);
    return [out, i];
  };

  const flushLists = () => {
    if (listLines.length === 0) return;
    const minIndent = Math.min(...listLines.map((line) => line.indent));
    listLines = listLines.map((line) => ({ ...line, indent: Math.max(line.indent, minIndent) }));
    html.push(renderLists(0, minIndent)[0]);
    listLines = [];
  };
  const indentOf = (line: string) => line.match(/^\s*/)?.[0].replace(/\t/g, '  ').length ?? 0;

  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    html.push(`<blockquote><p>${quoteLines.map(parseInlineMarkdown).join('<br/>')}</p></blockquote>`);
    quoteLines = [];
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const [head, ...body] = tableRows;
    const headerHtml = `<tr>${head.map((cell) => `<th>${parseInlineMarkdown(cell)}</th>`).join('')}</tr>`;
    const bodyHtml = body
      .map((row) => `<tr>${row.map((cell) => `<td>${parseInlineMarkdown(cell)}</td>`).join('')}</tr>`)
      .join('');
    html.push(`<table><tbody>${headerHtml}${bodyHtml}</tbody></table>`);
    tableRows = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushLists();
    flushQuote();
    flushTable();
  };

  lines.forEach((line, index) => {
    const nextLine = lines[index + 1] ?? '';

    if (isInCodeBlock) {
      if (/^```/.test(line)) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        isInCodeBlock = false;
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      return;
    }

    if (/^```/.test(line)) {
      flushAll();
      isInCodeBlock = true;
      codeLines = [];
      return;
    }

    if (!line.trim()) {
      flushAll();
      return;
    }

    if (isTableRow(line) && (isTableDivider(nextLine) || tableRows.length > 0)) {
      flushParagraph();
      flushLists();
      flushQuote();
      tableRows.push(splitTableRow(line));
      return;
    }

    if (isTableDivider(line)) {
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${parseInlineMarkdown(headingMatch[2])}</h${level}>`);
      return;
    }

    if (/^---+$/.test(line.trim())) {
      flushAll();
      html.push('<hr/>');
      return;
    }

    const taskMatch = line.match(/^\s*[-*+]\s+\[([ xX-])\]\s+(.+)$/);
    if (taskMatch) {
      flushParagraph();
      flushQuote();
      flushTable();
      listLines.push({
        indent: indentOf(line),
        kind: 'task',
        checked: taskMatch[1].toLowerCase() === 'x',
        dropped: taskMatch[1] === '-',
        text: taskMatch[2],
      });
      return;
    }

    const bulletMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      flushQuote();
      flushTable();
      listLines.push({ indent: indentOf(line), kind: 'ul', checked: false, dropped: false, text: bulletMatch[1] });
      return;
    }

    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      flushQuote();
      flushTable();
      listLines.push({ indent: indentOf(line), kind: 'ol', checked: false, dropped: false, text: orderedMatch[1] });
      return;
    }

    const quoteMatch = line.match(/^>\s?(.+)$/);
    if (quoteMatch) {
      flushParagraph();
      flushLists();
      flushTable();
      quoteLines.push(quoteMatch[1]);
      return;
    }

    flushLists();
    flushQuote();
    flushTable();
    paragraph.push(line);
  });

  if (isInCodeBlock) {
    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  flushAll();

  return html.join('');
};
