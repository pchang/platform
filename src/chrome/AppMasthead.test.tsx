import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

// jsdom has no media queries: each test says whether the window is md or wider.
let wide = true;
beforeEach(() => {
  wide = true;
  window.matchMedia = ((query: string) => ({
    matches: wide,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

const Masthead = ({ isSidebarOpen = false }: { isSidebarOpen?: boolean }) => (
  <AppearanceProvider>
    <PrincipalProvider fallback={null}>
      <AppMasthead isSidebarOpen={isSidebarOpen} onSidebarToggle={() => {}} />
    </PrincipalProvider>
  </AppearanceProvider>
);

describe('AppMasthead', () => {
  it('shows the product name as a link home', async () => {
    render(<Masthead />);
    const logo = await screen.findByRole('link', { name: product.name });
    expect(logo).toHaveAttribute('href', product.homeHref);
  });

  it('draws the menu button as two lines, and says whether the sidebar is open', async () => {
    const { rerender } = render(<Masthead />);
    const button = await screen.findByRole('button', { name: 'Navigation' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button.querySelectorAll('svg.app-menu-icon line')).toHaveLength(2);
    rerender(<Masthead isSidebarOpen />);
    expect(screen.getByRole('button', { name: 'Navigation' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('offers navigation, notifications, settings and profile by accessible name', async () => {
    render(<Masthead />);
    for (const name of ['Navigation', 'Notifications', 'Settings', 'Profile: Chloé Martin, Drug Safety Physician']) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('has the search field left of the icon buttons from md up', async () => {
    render(<Masthead />);
    const field = await screen.findByRole('textbox', { name: 'Search objects' });
    const notifications = screen.getByRole('button', { name: 'Notifications' });
    expect(field.compareDocumentPosition(notifications) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open search' })).not.toBeInTheDocument();
  });

  it('below md, opens the search field under the masthead from an Open search button, and closes it on Escape', async () => {
    wide = false;
    render(<Masthead />);
    const button = await screen.findByRole('button', { name: 'Open search' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('textbox', { name: 'Search objects' })).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: 'Search objects' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Search objects' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
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
