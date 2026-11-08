import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { product } from '../config/product';
import { AppearanceProvider } from '../appearance/AppearanceProvider';
import { AppMasthead } from './AppMasthead';

const Masthead = () => (
  <AppearanceProvider>
    <AppMasthead />
  </AppearanceProvider>
);

describe('AppMasthead', () => {
  it('shows the product name as a link home', () => {
    render(<Masthead />);
    const logo = screen.getByRole('link', { name: product.name });
    expect(logo).toHaveAttribute('href', product.homeHref);
  });

  it('offers notifications, settings and profile by accessible name', () => {
    render(<Masthead />);
    for (const name of ['Notifications', 'Settings', 'Profile']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<Masthead />);
    const results = await axe.run(container, {
      // jsdom has no layout, so contrast is checked in the browser tests.
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
