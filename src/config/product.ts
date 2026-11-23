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
   * The masthead's logo: the parent brand's own approved SVG in public/brand, its mark with the product's short name in the
   * brand's lettering. The platform never redraws, retypes or recolors it; the dark file is the same paths reversed to white.
   * Until the file is there, or if it cannot be loaded, the masthead shows the name as text. Without a dark file the light one
   * shows in both modes.
   */
  logo: { light: 'brand/lsh-logo.svg', dark: 'brand/lsh-logo-dark.svg' } satisfies BrandImage,
} as const;
