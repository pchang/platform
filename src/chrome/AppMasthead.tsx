import {
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
  NotificationBadge,
  PageToggleButton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { product } from '../config/product';
import { ProfileMenu } from './ProfileMenu';
import { SettingsMenu } from './SettingsMenu';
import './AppMasthead.css';

/**
 * Platform chrome (design system spec, section 4.1): the sidebar's menu button and the text logo on the left;
 * notifications, settings and profile on the right. The right-hand items stay
 * visible at every width, on one row with the logo, as icon buttons with
 * accessible names. The notification badge uses its read and unread states
 * once notifications exist.
 *
 * Settings opens a menu with Appearance (section 4.2). What notifications and
 * profile open is an open question, so they have no action yet.
 */
export function AppMasthead({ isSidebarOpen, onSidebarToggle }: { isSidebarOpen: boolean; onSidebarToggle: () => void }) {
  return (
    <Masthead display={{ default: 'inline' }}>
      <MastheadMain className="app-masthead__main">
        <MastheadToggle>
          <PageToggleButton isHamburgerButton isSidebarOpen={isSidebarOpen} onSidebarToggle={onSidebarToggle} aria-label="Navigation" />
        </MastheadToggle>
        <MastheadBrand>
          <MastheadLogo href={product.homeHref} className="app-masthead__logo">
            {product.name}
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar isFullHeight isStatic>
          <ToolbarContent>
            <ToolbarGroup
              variant="action-group-plain"
              align={{ default: 'alignEnd' }}
              gap={{ default: 'gapNone', md: 'gapMd' }}
            >
              <ToolbarItem>
                <NotificationBadge variant="plain" aria-label="Notifications" />
              </ToolbarItem>
              <ToolbarItem>
                <SettingsMenu />
              </ToolbarItem>
              <ToolbarItem>
                <ProfileMenu />
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );
}
