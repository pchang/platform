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
 * accessible names.
 *
 * Notifications opens the notification drawer; its badge shows the unread count,
 * and its name says how many are unread. Settings opens a menu with Appearance
 * (section 4.2). Profile opens a menu with who the person is.
 */
export function AppMasthead({
  isSidebarOpen,
  onSidebarToggle,
  notifications,
}: {
  isSidebarOpen: boolean;
  onSidebarToggle: () => void;
  notifications?: { unread: number; isExpanded: boolean; onToggle: () => void };
}) {
  const unread = notifications?.unread ?? 0;
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
                <NotificationBadge
                  variant={unread ? 'unread' : 'read'}
                  count={unread}
                  isExpanded={notifications?.isExpanded ?? false}
                  onClick={notifications?.onToggle}
                  aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
                />
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
