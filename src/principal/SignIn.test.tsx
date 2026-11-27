import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { ProfileMenu } from '../chrome/ProfileMenu';
import { RefusedError, type GatewayClient, type Me } from '../data/client';
import { PrincipalProvider } from './PrincipalProvider';

// Signing in (design system spec 4.1; platform spec 3.4, Identity), with a stand-in for the gateway.

let current: GatewayClient;
vi.mock('../data/client', async (original) => ({ ...(await original<typeof import('../data/client')>()), gatewayClient: async () => current }));

const ben = { person: 'urn:ben', name: 'Ben Okafor', roles: [{ role: 'urn:cdm', label: 'Clinical Data Manager' }, { role: 'urn:cra', label: 'Clinical Research Associate' }] };
const chloe = { person: 'urn:chloe', name: 'Chloé Martin', roles: [{ role: 'urn:dsp', label: 'Drug Safety Physician' }] };

function page(me: () => Promise<Me>) {
  current = { me, people: vi.fn(async () => [chloe, ben]) } as unknown as GatewayClient;
  return render(
    <PrincipalProvider fallback={null}>
      <ProfileMenu />
    </PrincipalProvider>,
  );
}

describe('signing in', () => {
  it('shows the sign-in page, not the chrome, until the person signs in', async () => {
    const { container } = page(() => Promise.reject(new RefusedError(['Sign in to continue.'], 401)));
    const button = await screen.findByRole('link', { name: 'Sign in with Google' });
    expect(button).toHaveAttribute('href', '/auth/login');
    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Profile/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign out' })).not.toBeInTheDocument();
    expect((await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('shows why an account was refused, with Sign out to try another', async () => {
    page(() => Promise.reject(new RefusedError(['No person in the platform has the email paul@example.com.'], 403)));
    expect(await screen.findByText('No person in the platform has the email paul@example.com.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign out' })).toHaveAttribute('href', '/auth/logout');
  });

  it('shows a refusal sent back from the sign-in, and clears it from the address', async () => {
    window.history.replaceState(null, '', '/?signin=someone%40elsewhere.com%20may%20not%20use%20this%20deployment.');
    page(() => Promise.reject(new RefusedError(['Sign in to continue.'], 401)));
    expect(await screen.findByText('someone@elsewhere.com may not use this deployment.')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('a signed-in person acts as themselves, choosing among their own roles, and can sign out', async () => {
    page(async () => ({ mode: 'signed-in', account: { email: 'ben@example.com', name: 'Ben Okafor' }, person: ben }));
    await userEvent.click(await screen.findByRole('button', { name: 'Profile: Ben Okafor, Clinical Data Manager' }));
    expect(screen.getAllByRole('listbox', { name: /^Act in role: / })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Ben Okafor'),
      expect.stringContaining('Ben Okafor'),
      expect.stringContaining('Sign out'),
    ]);
    expect(screen.getByText('Signed in as ben@example.com')).toBeInTheDocument();
  });

  it('in a demo deployment, the account may act as anyone, and the menu says it is a demo', async () => {
    page(async () => ({ mode: 'demo', account: { email: 'paul@example.com', name: 'Paul' } }));
    await userEvent.click(await screen.findByRole('button', { name: /^Profile: Chloé Martin/ }));
    expect(screen.getAllByRole('listbox', { name: /^Act as \(demo deployment\): / })[0]).toBeInTheDocument();
    expect(screen.getByText('Demo deployment: synthetic data, not kept')).toBeInTheDocument();
  });
});
