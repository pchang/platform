import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { product } from '../config/product';
import { AppearanceProvider } from '../appearance/AppearanceProvider';
import { PrincipalProvider } from '../principal/PrincipalProvider';
import { ChatProvider, useChat } from '../chat/ChatProvider';
import { ProcessProvider } from '../processes/ProcessProvider';
import { AppMasthead } from './AppMasthead';

// A fake gateway with one person, so the masthead test does not load the real gateway.
vi.mock('../data/client', () => ({
  gatewayClient: async () => ({
    me: async () => ({ mode: 'preview' as const }),
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

/** Shows whether the chat is open, as the panel would. */
function ChatState() {
  return <output aria-label="Chat">{useChat().isOpen ? 'open' : 'closed'}</output>;
}

const Masthead = ({ isSidebarOpen = false }: { isSidebarOpen?: boolean }) => (
  <AppearanceProvider>
    <PrincipalProvider fallback={null}>
      <ProcessProvider>
        <ChatProvider>
          <AppMasthead isSidebarOpen={isSidebarOpen} onSidebarToggle={() => {}} />
          <ChatState />
        </ChatProvider>
      </ProcessProvider>
    </PrincipalProvider>
  </AppearanceProvider>
);

describe('AppMasthead', () => {
  it('shows the product name as a link home', async () => {
    render(<Masthead />);
    const logo = await screen.findByRole('link', { name: product.name });
    expect(logo).toHaveAttribute('href', product.homeHref);
  });

  it('shows the brand’s logo as one image named for the whole product, with its reversed copy for dark mode', async () => {
    const { container } = render(<Masthead />);
    const link = await screen.findByRole('link', { name: product.name });
    const images = [...link.querySelectorAll('img.app-brand__logo')];
    expect(images.map((i) => i.getAttribute('src'))).toEqual([`/${product.logo.light}`, `/${product.logo.dark}`]);
    // Both pictures are decorative, so the link's name never depends on which copy is showing (light or dark).
    expect(images.map((i) => i.getAttribute('alt'))).toEqual(['', '']);
    expect(link).toHaveAttribute('aria-label', product.name);
    expect(container.querySelector('.app-masthead__name')).toBeNull();
    // The link reads once, as the product name.
    expect(screen.getAllByRole('link', { name: product.name })).toHaveLength(1);
  });

  it('falls back to the product name as text when a brand file cannot be loaded, never a broken image', async () => {
    const { container } = render(<Masthead />);
    const link = await screen.findByRole('link', { name: product.name });
    fireEvent.error(link.querySelector('img.app-brand__logo')!);
    expect(container.querySelectorAll('.app-brand')).toHaveLength(0);
    expect(container.querySelector('.app-masthead__name')).toHaveTextContent(product.name);
    expect(await screen.findByRole('link', { name: product.name })).toHaveAttribute('href', product.homeHref);
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

  it('has Ask, a pair of speech bubbles, left of the icon buttons at every width, which opens and closes the chat', async () => {
    for (const isWide of [true, false]) {
      wide = isWide;
      const { unmount } = render(<Masthead />);
      const ask = await screen.findByRole('button', { name: 'Ask' });
      expect(ask.compareDocumentPosition(screen.getByRole('button', { name: 'Notifications' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(ask).toHaveAttribute('aria-controls', 'app-chat');
      expect(ask).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      await userEvent.click(ask);
      expect(ask).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('status', { name: 'Chat' })).toHaveTextContent('open');
      await userEvent.click(ask);
      expect(screen.getByRole('status', { name: 'Chat' })).toHaveTextContent('closed');
      expect(ask).toHaveFocus();
      unmount();
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
