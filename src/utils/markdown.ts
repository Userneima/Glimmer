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

export const isLikelyMarkdown = (value: string) => {
  const text = value.replace(/\r\n/g, '\n').trim();
  if (!text) return false;

  const lines = text.split('\n');
  const blockSignals = lines.filter((line) => (
    /^#{1,6}\s+\S/.test(line) ||
    /^>\s+\S/.test(line) ||
    /^\s*[-*+]\s+\[[ xX]\]\s+\S/.test(line) ||
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
  let listItems: string[] = [];
  let orderedListItems: string[] = [];
  let taskItems: string[] = [];
  let quoteLines: string[] = [];
  let isInCodeBlock = false;
  let codeLines: string[] = [];
  let tableRows: string[][] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${paragraph.map(parseInlineMarkdown).join('<br/>')}</p>`);
    paragraph = [];
  };

  const flushLists = () => {
    if (listItems.length > 0) {
      html.push(`<ul>${listItems.join('')}</ul>`);
      listItems = [];
    }
    if (orderedListItems.length > 0) {
      html.push(`<ol>${orderedListItems.join('')}</ol>`);
      orderedListItems = [];
    }
    if (taskItems.length > 0) {
      html.push(`<ul data-type="taskList">${taskItems.join('')}</ul>`);
      taskItems = [];
    }
  };

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

    const taskMatch = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (taskMatch) {
      flushParagraph();
      flushQuote();
      flushTable();
      const checked = taskMatch[1].toLowerCase() === 'x';
      taskItems.push(
        `<li data-type="taskItem" data-checked="${checked ? 'true' : 'false'}"><label><input type="checkbox"${checked ? ' checked' : ''}><span></span></label><div><p>${parseInlineMarkdown(taskMatch[2])}</p></div></li>`,
      );
      return;
    }

    const bulletMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      flushQuote();
      flushTable();
      listItems.push(`<li><p>${parseInlineMarkdown(bulletMatch[1])}</p></li>`);
      return;
    }

    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      flushQuote();
      flushTable();
      orderedListItems.push(`<li><p>${parseInlineMarkdown(orderedMatch[1])}</p></li>`);
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
