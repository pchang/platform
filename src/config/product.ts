/**
 * Product identity shown in the chrome. The name is configuration, not code
 * (design system spec, section 4.1).
 */

/** An image file in public/brand, with an optional variant for dark mode (design system spec 4.1, Brand logo). */
export interface BrandImage {
  light: string;
  dark?: string;
}

export const product = {
  name: 'LS&H Ecosystem',
  homeHref: '#/',
  /**
   * The parent brand's own logo: its mark, then its wordmark, as the brand's approved SVG files in public/brand. The
   * platform never redraws or retypes them. Until the files are there, or if either cannot be loaded, the masthead shows
   * the name as text. Dark variants are optional: without one, the light file shows in both modes.
   */
  logo: {
    mark: { light: 'brand/3ds-mark.svg', dark: 'brand/3ds-mark-dark.svg' } satisfies BrandImage,
    wordmark: { light: 'brand/ls-h-wordmark.svg', dark: 'brand/ls-h-wordmark-dark.svg' } satisfies BrandImage,
  },
} as const;
