import { MenuToggle, Select, SelectGroup, SelectList, SelectOption } from '@patternfly/react-core';
import UserIcon from '@patternfly/react-icons/dist/esm/icons/user-icon';
import { useRef, useState } from 'react';
import { usePrincipal } from '../principal/PrincipalProvider';

/** Profile (design system spec 4.1): who you are and the role you act in, with the development persona switcher. */
export function ProfileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { people, principal, name, roleLabel, setPrincipal } = usePrincipal();
  const key = (person: string, role: string) => `${person} ${role}`;

  return (
    <Select
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      selected={key(principal.person, principal.role)}
      onSelect={(_event, value) => {
        const [person, role] = String(value).split(' ');
        setPrincipal({ person, role });
        setIsOpen(false);
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
      <SelectGroup label={`${name}, ${roleLabel}`}>
        <SelectList aria-label="Act as (development only)">
          {people.flatMap((p) =>
            p.roles.map((r) => (
              <SelectOption key={key(p.person, r.role)} value={key(p.person, r.role)} description={r.label}>
                {p.name}
              </SelectOption>
            )),
          )}
        </SelectList>
      </SelectGroup>
    </Select>
  );
}
