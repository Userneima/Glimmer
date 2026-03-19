import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ResizablePanelProps {
  children: React.ReactNode;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  isOpen: boolean;
  side?: 'left' | 'right';
  className?: string;
  persistKey?: string;
  onWidthChange?: (width: number) => void;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  minWidth = 200,
  maxWidth = 600,
  defaultWidth = 288,
  isOpen,
  side = 'right',
  className = '',
  persistKey,
  onWidthChange,
}) => {
  const clampWidth = useCallback(
    (value: number) => Math.max(minWidth, Math.min(maxWidth, value)),
    [minWidth, maxWidth]
  );

  const [width, setWidth] = useState(() => {
    if (!persistKey || typeof window === 'undefined') return clampWidth(defaultWidth);
    try {
      const stored = Number(localStorage.getItem(persistKey));
      return Number.isFinite(stored) ? clampWidth(stored) : clampWidth(defaultWidth);
    } catch (err) {
      console.warn('Failed to read persisted panel width', err);
      return clampWidth(defaultWidth);
    }
  });
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(width);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    widthRef.current = width;
    if (onWidthChange) {
      onWidthChange(width);
    }
  }, [width, onWidthChange]);

  const persistWidth = useCallback(
    (value: number) => {
      if (!persistKey || typeof window === 'undefined') return;
      try {
        localStorage.setItem(persistKey, String(clampWidth(value)));
      } catch (err) {
        // Persistence failures should not block UI resizing
        console.warn('Failed to persist panel width', err);
      }
    },
    [persistKey, clampWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return;

      const panelRect = panelRef.current.getBoundingClientRect();
      let newWidth: number;

      if (side === 'right') {
        newWidth = panelRect.right - e.clientX;
      } else {
        newWidth = e.clientX - panelRect.left;
      }

      // Constrain width
      const clamped = clampWidth(newWidth);
      setWidth(clamped);
      if (onWidthChange) {
        onWidthChange(clamped);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      persistWidth(widthRef.current);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, side, clampWidth, persistWidth, onWidthChange]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: `${width}px` }}
    >
      {/* Resize handle */}
      <div
        className={`absolute top-0 ${
          side === 'right' ? 'left-0' : 'right-0'
        } w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors group z-10`}
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-0 -mx-1" />
      </div>

      {/* Content */}
      <div className="h-full overflow-hidden">{children}</div>
    </div>
  );
};
