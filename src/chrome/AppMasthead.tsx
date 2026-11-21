import {
  Button,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
  PageToggleButton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { useState } from 'react';
import AttentionBellIcon from '@patternfly/react-icons/dist/esm/icons/attention-bell-icon';
import BellIcon from '@patternfly/react-icons/dist/esm/icons/bell-icon';
import CommentsIcon from '@patternfly/react-icons/dist/esm/icons/comments-icon';
import { useChat } from '../chat/ChatProvider';
import { product } from '../config/product';
import { ProfileMenu } from './ProfileMenu';
import { MenuIcon } from './MenuIcon';
import { SettingsMenu } from './SettingsMenu';
import './AppMasthead.css';

/** One brand image, with its dark variant shown in dark mode when it has one (design system spec 4.1, Brand logo). */
function BrandImage({ image, alt, className, onError }: { image: { light: string; dark?: string }; alt: string; className: string; onError: () => void }) {
  const src = (file: string) => `${import.meta.env.BASE_URL}${file}`;
  return (
    <>
      <img src={src(image.light)} alt={alt} className={`${className}${image.dark ? ' app-brand__light' : ''}`} onError={onError} />
      {image.dark && <img src={src(image.dark)} alt="" aria-hidden="true" className={`${className} app-brand__dark`} onError={onError} />}
    </>
  );
}

/**
 * The logo: the parent brand's mark, then its wordmark, as the brand's own files. The wordmark names the product, and the
 * mark is decorative, so the link reads once. The product name as text stands in until the files are there, or if
 * either cannot be loaded (design system spec 4.1, Brand logo).
 */
function BrandLogo() {
  const [failed, setFailed] = useState(false);
  const { logo } = product;
  if (failed) return <span className="app-masthead__name">{product.name}</span>;
  return (
    <span className="app-brand">
      <BrandImage image={logo.mark} alt="" className="app-brand__mark" onError={() => setFailed(true)} />
      <BrandImage image={logo.wordmark} alt={product.name} className="app-brand__wordmark" onError={() => setFailed(true)} />
    </span>
  );
}

/**
 * Platform chrome (design system spec, section 4.1): the sidebar's menu button and the text logo on the left;
 * Ask, then notifications, settings and profile on the right. Ask opens the chat panel, a conversation with the
 * platform for a search or a question (section 4.1, Ask). The right-hand items stay
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
  const chat = useChat();
  return (
    <Masthead display={{ default: 'inline' }} className="app-masthead">
      <MastheadMain className="app-masthead__main">
        <MastheadToggle>
          <PageToggleButton isSidebarOpen={isSidebarOpen} onSidebarToggle={onSidebarToggle} aria-label="Navigation" className="app-menu-toggle" icon={<MenuIcon />} />
        </MastheadToggle>
        <MastheadBrand className="app-masthead__brand">
          <MastheadLogo href={product.homeHref} className="app-masthead__logo">
            <BrandLogo />
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
                {/* Speech bubbles, not a magnifier: a conversation with the platform (design system spec 4.1, Ask). */}
                <Button
                  ref={chat.trigger}
                  variant="plain"
                  icon={<CommentsIcon />}
                  aria-label="Ask"
                  aria-expanded={chat.isOpen}
                  aria-controls="app-chat"
                  onClick={chat.toggle}
                />
              </ToolbarItem>
              <ToolbarItem>
                {/* A plain icon button like Settings and Profile, with the unread count as its badge (design system spec 4.1). */}
                <Button
                  variant="plain"
                  icon={unread ? <AttentionBellIcon /> : <BellIcon />}
                  {...(unread ? { countOptions: { count: unread, isRead: false } } : {})}
                  aria-expanded={notifications?.isExpanded ?? false}
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
