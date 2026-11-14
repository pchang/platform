import {
  Button,
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
import SearchIcon from '@patternfly/react-icons/dist/esm/icons/search-icon';
import { useRef, useState } from 'react';
import { product } from '../config/product';
import { ProfileMenu } from './ProfileMenu';
import { MenuIcon } from './MenuIcon';
import { SearchField } from './SearchField';
import { SettingsMenu } from './SettingsMenu';
import { useMediaQuery } from './useMediaQuery';
import './AppMasthead.css';

/**
 * Platform chrome (design system spec, section 4.1): the sidebar's menu button and the text logo on the left;
 * the search field, then notifications, settings and profile on the right. Below md the search field is a Search
 * button that opens the field in a row under the masthead. The right-hand items stay
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
  searchQuery,
}: {
  isSidebarOpen: boolean;
  onSidebarToggle: () => void;
  notifications?: { unread: number; isExpanded: boolean; onToggle: () => void };
  /** The query of the search page being shown, if it is. */
  searchQuery?: string;
}) {
  const unread = notifications?.unread ?? 0;
  // PatternFly's md breakpoint: from there up the field fits beside the logo and the icons.
  const hasRoomForField = useMediaQuery('(min-width: 768px)');
  const [isSearchOpen, setSearchOpen] = useState(false);
  const searchButton = useRef<HTMLButtonElement>(null);
  const closeSearch = (returnFocus: boolean) => {
    setSearchOpen(false);
    if (returnFocus) searchButton.current?.focus();
  };
  return (
    <Masthead display={{ default: 'inline' }} className="app-masthead">
      <MastheadMain className="app-masthead__main">
        <MastheadToggle>
          <PageToggleButton isSidebarOpen={isSidebarOpen} onSidebarToggle={onSidebarToggle} aria-label="Navigation" className="app-menu-toggle" icon={<MenuIcon />} />
        </MastheadToggle>
        <MastheadBrand className="app-masthead__brand">
          <MastheadLogo href={product.homeHref} className="app-masthead__logo">
            <span className="app-masthead__name">{product.name}</span>
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
              <ToolbarItem className="app-masthead__search">
                {hasRoomForField ? (
                  <SearchField query={searchQuery} onNavigate={() => {}} />
                ) : (
                  <Button
                    ref={searchButton}
                    variant="plain"
                    icon={<SearchIcon />}
                    aria-label="Open search"
                    aria-expanded={isSearchOpen}
                    aria-controls="app-masthead-search-row"
                    onClick={() => setSearchOpen((open) => !open)}
                  />
                )}
              </ToolbarItem>
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
      {!hasRoomForField && isSearchOpen && (
        <div id="app-masthead-search-row" className="app-masthead__search-row">
          <SearchField query={searchQuery} onNavigate={() => closeSearch(false)} onEscape={() => closeSearch(true)} autoFocus />
        </div>
      )}
    </Masthead>
  );
}
