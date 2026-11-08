import { MenuToggle, Select, SelectGroup, SelectList, SelectOption } from '@patternfly/react-core';
import CogIcon from '@patternfly/react-icons/dist/esm/icons/cog-icon';
import { useRef, useState } from 'react';
import { dayHours, type AppearanceSetting } from '../appearance/appearance';
import { useAppearance } from '../appearance/AppearanceProvider';

/** Settings in the chrome (design system spec, sections 4.1 and 4.2). For now it holds Appearance. */
export function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { setting, setSetting } = useAppearance();
  const { start, end } = dayHours();

  return (
    <Select
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      selected={setting}
      onSelect={(_event, value) => {
        setSetting(value as AppearanceSetting);
        setIsOpen(false);
      }}
      // On narrow screens the menu shifts to stay fully on screen (design system spec, section 4).
      popperProps={{ position: 'right', preventOverflow: true, maxWidth: 'calc(100vw - 2 * var(--pf-t--global--spacer--md))' }}
      toggle={{
        toggleRef,
        toggleNode: (
          <MenuToggle
            ref={toggleRef}
            variant="plain"
            icon={<CogIcon />}
            aria-label="Settings"
            isExpanded={isOpen}
            onClick={() => setIsOpen(!isOpen)}
          />
        ),
      }}
    >
      <SelectGroup label="Appearance">
        <SelectList aria-label="Appearance">
          <SelectOption value="auto" description={`Light from ${start} to ${end}, dark otherwise`}>
            Automatic
          </SelectOption>
          <SelectOption value="light">Light</SelectOption>
          <SelectOption value="dark">Dark</SelectOption>
        </SelectList>
      </SelectGroup>
    </Select>
  );
}
