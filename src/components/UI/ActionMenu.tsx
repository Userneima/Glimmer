import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';

interface ActionItem {
  label: string;
  onClick?: () => void;
  children?: ActionItem[];
}

interface ActionMenuProps {
  items: ActionItem[];
  className?: string;
}

export const ActionMenu: React.FC<ActionMenuProps> = ({ items, className }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const [submenuIndex, setSubmenuIndex] = useState<number | null>(null);

  return (
    <div className={`relative inline-block ${className ?? ''}`} ref={ref}>
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center justify-center p-2 rounded hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        title="More actions"
        type="button"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded shadow z-50"
        >
          {items.map((it, idx) => (
            <div key={idx} className="relative">
              <button
                role="menuitem"
                onClick={() => {
                  if (it.onClick) {
                    it.onClick();
                    setOpen(false);
                  } else if (it.children) {
                    setSubmenuIndex(idx === submenuIndex ? null : idx);
                  }
                }}
                onMouseEnter={() => it.children && setSubmenuIndex(idx)}
                onMouseLeave={() => it.children && setSubmenuIndex(null)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
              >
                <span>{it.label}</span>
                {it.children && <span className="text-xs text-gray-400">›</span>}
              </button>

              {it.children && submenuIndex === idx && (
                <div className="absolute top-0 right-full mr-2 w-48 bg-white border border-gray-200 rounded shadow">
                  {it.children.map((c, j) => (
                    <button
                      key={j}
                      role="menuitem"
                      onClick={() => {
                        if (c.onClick) {
                          c.onClick();
                        }
                        setOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
