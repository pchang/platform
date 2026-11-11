import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { product } from '../config/product';
import { AppearanceProvider } from '../appearance/AppearanceProvider';
import { PrincipalProvider } from '../principal/PrincipalProvider';
import { AppMasthead } from './AppMasthead';

// A fake gateway with one person, so the masthead test does not load the real gateway.
vi.mock('../data/client', () => ({
  gatewayClient: async () => ({
    people: async () => [{ person: 'urn:test:person-chloe', name: 'Chloé Martin', roles: [{ role: 'urn:test:dsp', label: 'Drug Safety Physician' }] }],
  }),
}));

const Masthead = () => (
  <AppearanceProvider>
    <PrincipalProvider fallback={null}>
      <AppMasthead isSidebarOpen={false} onSidebarToggle={() => {}} />
    </PrincipalProvider>
  </AppearanceProvider>
);

describe('AppMasthead', () => {
  it('shows the product name as a link home', async () => {
    render(<Masthead />);
    const logo = await screen.findByRole('link', { name: product.name });
    expect(logo).toHaveAttribute('href', product.homeHref);
  });

  it('offers navigation, notifications, settings and profile by accessible name', async () => {
    render(<Masthead />);
    for (const name of ['Navigation', 'Notifications', 'Settings', 'Profile: Chloé Martin, Drug Safety Physician']) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<Masthead />);
    await screen.findByRole('link', { name: product.name });
    const results = await axe.run(container, {
      // jsdom has no layout, so contrast is checked in the browser tests.
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
