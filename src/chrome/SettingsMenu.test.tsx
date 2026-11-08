import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DARK_CLASS } from '../appearance/appearance';
import { AppearanceProvider } from '../appearance/AppearanceProvider';
import { appearanceConfig } from '../config/appearance';
import { SettingsMenu } from './SettingsMenu';

const renderMenu = () =>
  render(
    <AppearanceProvider>
      <SettingsMenu />
    </AppearanceProvider>,
  );

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove(DARK_CLASS);
});

describe('SettingsMenu', () => {
  it('offers Automatic, Light and Dark under Appearance, with Automatic selected by default', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Automatic/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /Automatic/ })).toHaveTextContent(/Light from 7:00\sAM to 7:00\sPM, dark otherwise/);
    expect(screen.getByRole('option', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dark' })).toBeInTheDocument();
  });

  it('forces dark mode and remembers it on the device', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('option', { name: 'Dark' }));
    expect(document.documentElement).toHaveClass(DARK_CLASS);
    expect(localStorage.getItem(appearanceConfig.storageKey)).toBe('dark');
  });
});
