import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Target } from 'lucide-react';
import { t } from '../../i18n';
import { parseLongTermFocus } from '../../utils/longTermFocus';

// 每篇日记上方的「长期在做」。内容只从「长期任务」文档里读，这里不能编辑：
// 改就点过去在文档里改，免得同一份清单在两处各有一份。
const COLLAPSED_KEY = 'glimmer-longterm-strip-collapsed';

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};

type LongTermFocusStripProps = {
  sourceHtml: string;
  onOpenSource: () => void;
};

export const LongTermFocusStrip: React.FC<LongTermFocusStripProps> = ({ sourceHtml, onOpenSource }) => {
  const items = useMemo(() => parseLongTermFocus(sourceHtml), [sourceHtml]);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // 记不住只是下次打开还是展开
      }
      return next;
    });
  };

  // 文档里还没有这一节就不占地方。
  if (items.length === 0) return null;

  return (
    <div className="border-b px-4 py-2" style={{ borderColor: 'var(--glimmer-border)', background: 'var(--glimmer-surface-header)' }}>
      <div className="mx-auto max-w-5xl text-sm">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-500 transition-colors hover:text-primary-900"
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            <Target size={13} strokeWidth={1.75} />
            {t('Long-term focus', { count: items.length })}
          </button>
          <button
            type="button"
            onClick={onOpenSource}
            className="text-xs font-medium text-primary-400 transition-colors hover:text-accent-600"
          >
            {t('Edit long-term focus')}
          </button>
        </div>
        {!collapsed && (
          // 名字一列按最长的那个对齐，但不超过四成宽，下一步一列就能竖着对齐。
          <ul className="mt-1.5 grid gap-x-3 gap-y-1 pl-5" style={{ gridTemplateColumns: 'fit-content(40%) minmax(0, 1fr)' }}>
            {items.map((item, index) => (
              <li key={`${index}-${item.name}`} className="contents">
                <button
                  type="button"
                  onClick={onOpenSource}
                  className="min-w-0 truncate text-left text-primary-900 transition-colors hover:text-accent-600"
                  title={item.name}
                >
                  {item.name}
                </button>
                <span className="min-w-0 text-primary-600">
                  {item.next ? (
                    <>
                      <span className="text-xs text-primary-400">{t('Next step')}</span>
                      {' '}
                      {item.next}
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
