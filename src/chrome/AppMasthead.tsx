import {
  Button,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  NotificationBadge,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import CogIcon from '@patternfly/react-icons/dist/esm/icons/cog-icon';
import UserIcon from '@patternfly/react-icons/dist/esm/icons/user-icon';
import { product } from '../config/product';
import './AppMasthead.css';

/**
 * Platform chrome (design system spec, section 4.1): text logo on the left;
 * notifications, settings and profile on the right. The right-hand items stay
 * visible at every width, on one row with the logo, as icon buttons with
 * accessible names. The notification badge uses its read and unread states
 * once notifications exist.
 *
 * What each item opens is an open question, so they have no action yet.
 */
export function AppMasthead() {
  return (
    <Masthead display={{ default: 'inline' }}>
      <MastheadMain className="app-masthead__main">
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
                <Button variant="plain" icon={<CogIcon />} aria-label="Settings" />
              </ToolbarItem>
              <ToolbarItem>
                <Button variant="plain" icon={<UserIcon />} aria-label="Profile" />
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );
}
