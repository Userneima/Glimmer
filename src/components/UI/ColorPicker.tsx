import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Ban, Check } from 'lucide-react';
import { t } from '../../i18n';

export type ColorPickerAnchor = {
  /** Viewport-space top edge of the trigger. */
  top: number;
  /** Viewport-space bottom edge of the trigger. */
  bottom: number;
  /** Viewport-space horizontal center of the trigger. */
  left: number;
};

interface ColorPickerProps {
  anchor: ColorPickerAnchor;
  currentColor?: string | null;
  onColorSelect: (color: string) => void;
  onClearColor: () => void;
  onClose: () => void;
}

/** Mid-tone hues stay legible on both the light and dark editor background. */
const PRESET_HUES = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899',
];

// The second row needs the end of the value range the editor background is not
// on, otherwise half the presets paint text the reader cannot see.
const PRESET_ON_LIGHT = [
  '#991B1B', '#9A3412', '#166534', '#155E75', '#1E40AF', '#5B21B6', '#6B7280', '#111827',
];
const PRESET_ON_DARK = [
  '#FCA5A5', '#FDBA74', '#86EFAC', '#67E8F9', '#93C5FD', '#C4B5FD', '#9CA3AF', '#F3F4F6',
];

// Theme-independent, so a colour is never a preset in one theme and a recently
// used entry in the other.
const ALL_PRESETS = new Set([...PRESET_HUES, ...PRESET_ON_LIGHT, ...PRESET_ON_DARK]);

const STORAGE_KEY = 'diary_saved_colors';
const MAX_RECENT_COLORS = 16;
const PANEL_WIDTH = 248;
const VIEWPORT_MARGIN = 8;

const HEX_PATTERN = /^#[0-9A-F]{6}$/i;
const RGB_PATTERN = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i;

const isValidHex = (hex: string) => HEX_PATTERN.test(hex);
const normalizeHex = (hex: string) => hex.toUpperCase();

// Stored diaries come back from the editor as `rgb(...)`, so the colour the
// caller hands us is not necessarily the hex we wrote. The only other source is
// the native picker, which always hands back a full six-digit value.
const toHex = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const input = value.trim();
  if (isValidHex(input)) return normalizeHex(input);
  const rgb = input.match(RGB_PATTERN);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map((channel) => Number(channel));
  if (channels.some((channel) => !Number.isFinite(channel) || channel > 255)) return null;
  return normalizeHex(`#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`);
};

const writeRecentColors = (colors: string[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch (err) {
    console.warn('Failed to persist recent colors', err);
  }
};

const readRecentColors = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const colors: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string' || !isValidHex(item)) continue;
      const normalized = normalizeHex(item);
      // Preset colours are already one click away; keeping them here too only
      // produces a second identical swatch.
      if (seen.has(normalized) || ALL_PRESETS.has(normalized)) continue;
      seen.add(normalized);
      colors.push(normalized);
    }
    const kept = colors.slice(0, MAX_RECENT_COLORS);
    // Drop whatever was pruned for good, so the stored list matches what shows.
    if (kept.length !== parsed.length) writeRecentColors(kept);
    return kept;
  } catch {
    return [];
  }
};

// Perceived brightness, not HSV value: a dark blue like #1E40AF looks bright in
// isolation but still needs a white tick on top of it.
const isLightColor = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
};

type SwatchProps = {
  color: string;
  isSelected: boolean;
  onPick: (color: string) => void;
};

const Swatch: React.FC<SwatchProps> = ({ color, isSelected, onPick }) => (
  <button
    type="button"
    title={color}
    aria-label={color}
    onMouseDown={(event) => {
      event.preventDefault();
      onPick(color);
    }}
    className="flex aspect-square w-full items-center justify-center rounded-md border transition-transform duration-150 hover:scale-110 active:scale-95"
    style={{
      backgroundColor: color,
      borderColor: isSelected ? 'var(--aurora-accent)' : 'var(--glimmer-border)',
      boxShadow: isSelected ? '0 0 0 2px color-mix(in srgb, var(--aurora-accent) 38%, transparent)' : undefined,
    }}
  >
    {isSelected && <Check size={11} strokeWidth={3} color={isLightColor(color) ? '#111827' : '#FFFFFF'} />}
  </button>
);

export const ColorPicker: React.FC<ColorPickerProps> = ({
  anchor,
  currentColor,
  onColorSelect,
  onClearColor,
  onClose,
}) => {
  const appliedColor = toHex(currentColor);
  const panelRef = useRef<HTMLDivElement>(null);
  const [recentColors, setRecentColors] = useState<string[]>(() => readRecentColors());
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const presetColors = useMemo(
    () => [...PRESET_HUES, ...(document.documentElement.dataset.theme === 'dark' ? PRESET_ON_DARK : PRESET_ON_LIGHT)],
    []
  );

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let top = anchor.bottom + VIEWPORT_MARGIN;
    if (top + height > window.innerHeight - VIEWPORT_MARGIN) {
      const above = anchor.top - height - VIEWPORT_MARGIN;
      top = above >= VIEWPORT_MARGIN
        ? above
        : Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
    }
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, anchor.left - width / 2),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
    );
    setCoords({ top, left });
  }, [anchor, recentColors.length]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      // The trigger owns its own toggle; let it handle the click.
      if (target.closest('[data-color-trigger]')) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose]);

  const pick = useCallback((color: string) => {
    const normalized = normalizeHex(color);
    if (normalized !== appliedColor) onColorSelect(normalized);
    // Recent colours maintain themselves: whatever gets used rises to the top.
    // Presets are excluded because they are already one click away.
    if (!ALL_PRESETS.has(normalized)) {
      setRecentColors((prev) => {
        const next = [normalized, ...prev.filter((item) => item !== normalized)].slice(0, MAX_RECENT_COLORS);
        writeRecentColors(next);
        return next;
      });
    }
    onClose();
  }, [appliedColor, onColorSelect, onClose]);

  const sectionLabelStyle: React.CSSProperties = { color: 'var(--aurora-muted)' };

  return (
    <div
      ref={panelRef}
      className="glimmer-panel fixed z-[60] border rounded-apple-lg shadow-apple-xl backdrop-blur-apple p-3.5"
      style={{
        width: `${PANEL_WIDTH}px`,
        top: coords ? `${coords.top}px` : '-9999px',
        left: coords ? `${coords.left}px` : '-9999px',
        opacity: coords ? 1 : 0,
      }}
    >
      <div>
        <div className="mb-1.5 text-[11px] font-medium" style={sectionLabelStyle}>{t('Preset Colors')}</div>
        <div className="grid grid-cols-8 gap-1.5">
          {presetColors.map((color) => (
            <Swatch
              key={color}
              color={color}
              isSelected={appliedColor === color}
              onPick={pick}
            />
          ))}
        </div>
      </div>

      {recentColors.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-medium" style={sectionLabelStyle}>{t('Recent Colors')}</div>
          <div className="grid grid-cols-8 gap-1.5">
            {recentColors.map((color) => (
              <Swatch
                key={color}
                color={color}
                isSelected={appliedColor === color}
                onPick={pick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Anything outside the two grids goes through the OS colour picker: it is
          one native control instead of a hand-rolled wheel plus hue slider. */}
      <div className="mt-3 flex items-center gap-2">
        <label className="inline-flex h-7 flex-1 cursor-pointer items-center gap-2 rounded-apple-sm border px-2"
          style={{ borderColor: 'var(--glimmer-border)' }}>
          <input
            type="color"
            value={appliedColor ?? '#EF4444'}
            aria-label={t('Pick a color')}
            onChange={(event) => pick(event.target.value)}
            className="h-5 w-7 cursor-pointer border-none bg-transparent p-0"
          />
          <span className="text-[11px]" style={{ color: 'var(--aurora-secondary)' }}>{t('Pick a color')}</span>
        </label>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            onClearColor();
            onClose();
          }}
          className="flex h-7 items-center gap-1.5 rounded-apple-sm border px-2 text-[11px] transition-colors duration-150 hover:bg-primary-100"
          style={{ borderColor: 'var(--glimmer-border)', color: 'var(--aurora-secondary)' }}
        >
          <Ban size={13} strokeWidth={1.9} />
          {t('Clear Color')}
        </button>
      </div>
    </div>
  );
};
