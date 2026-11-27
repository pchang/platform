import { Divider, MenuToggle, Select, SelectGroup, SelectList, SelectOption } from '@patternfly/react-core';
import UserIcon from '@patternfly/react-icons/dist/esm/icons/user-icon';
import { useRef, useState } from 'react';
import { usePrincipal } from '../principal/PrincipalProvider';
import { routeHref } from '../routing';
import { peopleByDomain } from './peopleByDomain';

/**
 * Profile (design system spec 4.1): who you are and the role you act in, the signed-in account and Sign out where people
 * sign in, and the persona switcher in development, previews and demo deployments.
 */
/** The option that signs out. */
const SIGN_OUT = 'sign-out';

export function ProfileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { people, principal, name, roleLabel, setPrincipal, me } = usePrincipal();
  const account = 'account' in me ? me.account : undefined;
  // Anyone may be acted as in development, previews and a demo deployment; a signed-in person picks among their own roles.
  const label = me.mode === 'signed-in' ? 'Act in role' : me.mode === 'demo' ? 'Act as (demo deployment)' : 'Act as (development only)';
  const key = (person: string, role: string) => `${person} ${role}`;

  return (
    <Select
      className="app-header-menu"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      selected={key(principal.person, principal.role)}
      onSelect={(_event, value) => {
        if (value === SIGN_OUT) {
          window.location.assign('/auth/logout');
          return;
        }
        const [person, role] = String(value).split(' ');
        setIsOpen(false);
        if (person === principal.person && role === principal.role) return;
        setPrincipal({ person, role });
        // Someone else, or another role, starts on their own Home: the page before may not apply to them (design system spec 4.1, Profile).
        window.location.hash = routeHref({ name: 'todo' });
      }}
      popperProps={{ position: 'right', preventOverflow: true, maxWidth: 'calc(100vw - 2 * var(--pf-t--global--spacer--md))' }}
      toggle={{
        toggleRef,
        toggleNode: (
          <MenuToggle
            ref={toggleRef}
            variant="plain"
            icon={<UserIcon />}
            aria-label={`Profile: ${name}, ${roleLabel}`}
            isExpanded={isOpen}
            onClick={() => setIsOpen(!isOpen)}
          />
        ),
      }}
    >
      {/* Who the person is now, as the menu's heading; the people to act as follow, by domain. */}
      <SelectGroup label={`${name}, ${roleLabel}`}>{null}</SelectGroup>
      {peopleByDomain(people).map((g) => (
        <div key={g.domain}>
          <Divider />
          <SelectGroup label={g.label}>
            <SelectList aria-label={`${label}: ${g.label}`}>
              {g.entries.map((e) => (
                <SelectOption key={key(e.person, e.role)} value={key(e.person, e.role)} description={e.roleLabel}>
                  {e.name}
                </SelectOption>
              ))}
            </SelectList>
          </SelectGroup>
        </div>
      ))}
      {account && (
        <>
          <Divider />
          <SelectGroup label={`Signed in as ${account.email}`}>
            <SelectList aria-label="Account">
              <SelectOption value={SIGN_OUT} description={me.mode === 'demo' ? 'Demo deployment: synthetic data, not kept' : undefined}>
                Sign out
              </SelectOption>
            </SelectList>
          </SelectGroup>
        </>
      )}
    </Select>
  );
}
