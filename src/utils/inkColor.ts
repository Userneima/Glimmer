// Text colour picked in one theme has to stay readable in the other, so every
// applied colour is stored as a pair: the inline `color` (what light mode and
// every export shows) plus a lightened twin for dark mode.
//
// Only lightness moves. Hue and saturation are what he picked; contrast is
// arithmetic, so it is computed rather than guessed.

// The editor's own surfaces, flattened over the page background.
const LIGHT_SURFACE = { r: 0xf7, g: 0xf9, b: 0xfc };
const DARK_SURFACE = { r: 0x0d, g: 0x14, b: 0x1c };
const MIN_CONTRAST = 4.5;

// A colour with almost no hue is not "some grey", it is the product's own text
// ink. Mapping it onto the theme's text colours reads better than lightening a
// near-black towards a muddy blue.
const NEUTRAL_SATURATION = 0.15;
const NEUTRAL_INK = {
  light: { strong: '#182332', muted: '#6B7789' },
  dark: { strong: '#F4F8FF', muted: '#A7B4C6' },
};

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseColor = (input: string): Rgb | null => {
  const value = input.trim();

  const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16),
    };
  }

  const long = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (long) {
    return {
      r: parseInt(long[1], 16),
      g: parseInt(long[2], 16),
      b: parseInt(long[3], 16),
    };
  }

  const rgb = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) {
    return {
      r: clamp(Number(rgb[1]), 0, 255),
      g: clamp(Number(rgb[2]), 0, 255),
      b: clamp(Number(rgb[3]), 0, 255),
    };
  }

  return null;
};

const toHex = ({ r, g, b }: Rgb) => {
  const part = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
};

const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === rn) {
    h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
  } else if (max === gn) {
    h = ((bn - rn) / delta + 2) / 6;
  } else {
    h = ((rn - gn) / delta + 4) / 6;
  }

  return { h, s, l };
};

const hslToRgb = ({ h, s, l }: Hsl): Rgb => {
  if (s === 0) {
    const value = l * 255;
    return { r: value, g: value, b: value };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let shifted = t;
    if (shifted < 0) shifted += 1;
    if (shifted > 1) shifted -= 1;
    if (shifted < 1 / 6) return p + (q - p) * 6 * shifted;
    if (shifted < 1 / 2) return q;
    if (shifted < 2 / 3) return p + (q - p) * (2 / 3 - shifted) * 6;
    return p;
  };

  return {
    r: channel(h + 1 / 3) * 255,
    g: channel(h) * 255,
    b: channel(h - 1 / 3) * 255,
  };
};

const relativeLuminance = ({ r, g, b }: Rgb) => {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrastRatio = (a: Rgb, b: Rgb) => {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
};

// Walks lightness one step at a time towards the given direction and stops at
// the first value that reads clearly on that surface.
const fitToSurface = (rgb: Rgb, surface: Rgb, direction: 'darker' | 'lighter') => {
  if (contrastRatio(rgb, surface) >= MIN_CONTRAST) {
    return rgb;
  }

  const hsl = rgbToHsl(rgb);
  const step = direction === 'darker' ? -0.02 : 0.02;
  let lightness = hsl.l;

  for (let i = 0; i < 50; i += 1) {
    lightness = clamp(lightness + step, 0, 1);
    const candidate = hslToRgb({ ...hsl, l: lightness });
    if (contrastRatio(candidate, surface) >= MIN_CONTRAST) {
      return candidate;
    }
    if (lightness === 0 || lightness === 1) break;
  }

  return hslToRgb({ ...hsl, l: lightness });
};

export type InkPair = {
  light: string;
  dark: string;
};

// Both halves of an applied colour. Feed it whatever the picker returned.
export const adaptInk = (input: string): InkPair | null => {
  const rgb = parseColor(input);
  if (!rgb) return null;

  const hsl = rgbToHsl(rgb);
  // Near-black and near-white carry a trace of hue that would otherwise
  // lighten into something like periwinkle. They mean ink, so treat them as ink.
  const nearInk = hsl.l < 0.14 || hsl.l > 0.93;
  if (hsl.s < NEUTRAL_SATURATION || nearInk) {
    const strong = nearInk || hsl.l < 0.25 || hsl.l > 0.85;
    const tone = strong ? 'strong' : 'muted';
    return {
      light: NEUTRAL_INK.light[tone],
      dark: NEUTRAL_INK.dark[tone],
    };
  }

  return {
    light: toHex(fitToSurface(rgb, LIGHT_SURFACE, 'darker')),
    dark: toHex(fitToSurface(rgb, DARK_SURFACE, 'lighter')),
  };
};

// The dark-mode twin of a colour that was stored before colours came in pairs.
export const darkInkFor = (input: string): string | null => {
  const pair = adaptInk(input);
  return pair ? pair.dark : null;
};
