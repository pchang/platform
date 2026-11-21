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
   * The masthead's logo: the parent brand's own mark, an approved SVG file in public/brand that the platform never redraws,
   * then the product's short name as text. Until the mark's file is there, or if it cannot be loaded, the masthead shows the
   * name as text. The dark variant is optional: without one, the light file shows in both modes.
   */
  logo: {
    mark: { light: 'brand/3ds-mark.svg', dark: 'brand/3ds-mark-dark.svg' } satisfies BrandImage,
    shortName: 'LS&H',
  },
} as const;
