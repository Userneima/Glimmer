import { Extension } from '@tiptap/core';
import { darkInkFor } from '../../utils/inkColor';

// Carries the dark-mode twin of a text colour as a custom property on the same
// span the Color extension writes, so `style="color:#991B1B; --dark-ink:#E04F4F"`.
//
// The inline `color` stays a plain hex on purpose: it is what light mode shows
// and what every export (Word, PDF, HTML) can read. Dark mode swaps in the
// custom property from CSS.
export const AdaptiveInk = Extension.create({
  name: 'adaptiveInk',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          darkInk: {
            default: null,
            parseHTML: (element) => {
              const stored = element.style.getPropertyValue('--dark-ink').trim();
              if (stored) return stored;
              // Text coloured before colours came in pairs, or pasted from
              // elsewhere: derive the twin instead of leaving it unreadable.
              const color = element.style.color;
              return color ? darkInkFor(color) : null;
            },
            renderHTML: (attributes) => {
              if (!attributes.darkInk) return {};
              return { style: `--dark-ink: ${attributes.darkInk}` };
            },
          },
        },
      },
    ];
  },
});
