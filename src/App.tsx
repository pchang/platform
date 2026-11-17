import { Page, PageSection } from '@patternfly/react-core';
import { useState } from 'react';
import { CatalogPreview } from './catalog/CatalogPreview';
import { AppMasthead } from './chrome/AppMasthead';
import { AppSidebar } from './chrome/AppSidebar';
import { NotificationsDrawer } from './chrome/NotificationsDrawer';
import { NotificationsProvider, useNotifications } from './notifications/NotificationsProvider';
import { ObjectDrawer } from './objects/ObjectPanel';
import { ObjectPanelProvider, useObjectPanel } from './objects/ObjectPanelProvider';
import { useMediaQuery } from './chrome/useMediaQuery';
import { ChatPanel } from './chat/ChatPanel';
import { ChatProvider, useChat } from './chat/ChatProvider';
import { ProcessDock } from './chrome/ProcessDock';
import { ProcessHost, useFrontIsPage } from './processes/ProcessHost';
import { ProcessProvider } from './processes/ProcessProvider';
import { useRoute } from './routing';
import { GlanceView } from './views/Glance';
import { useGlanceList } from './views/landing';
import { SearchView, TodoView, TypeView } from './views/OrientViews';

/** From PatternFly's xl breakpoint up, the sidebar sits beside the content; below it, it is a drawer (design system spec 4.1). */
const isWide = () => window.innerWidth >= 1200;

/** The Page template: masthead and sidebar chrome, with the current view in the main area. */
export function App() {
  return (
    <NotificationsProvider>
      <ProcessProvider>
        <ObjectPanelProvider>
          <ChatProvider>
            <AppPage />
            <ChatPanel />
          </ChatProvider>
        </ObjectPanelProvider>
      </ProcessProvider>
    </NotificationsProvider>
  );
}

function AppPage() {
  const route = useRoute();
  const [wide, setWide] = useState(isWide);
  const [isSidebarOpen, setSidebarOpen] = useState(wide);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const { unread } = useNotifications();
  // A page pattern, such as Compare and decide, takes the view's place while it is in front (design system spec 5.1).
  const frontIsPage = useFrontIsPage();
  const chat = useChat();
  // Home opens where the person's role does: At a glance for a role that oversees initiatives, else To do (platform spec 3.3).
  const glanceList = useGlanceList();
  const home = route.name === 'glance' ? 'glance' : route.name === 'todo' ? 'todo' : route.name === 'home' ? (glanceList ? (glanceList.oversees ? 'glance' : 'todo') : undefined) : undefined;
  // Expanded, the object panel covers the sidebar too, so no destination is chosen behind it (design system spec 4.4).
  const panel = useObjectPanel();
  const canExpand = useMediaQuery('(min-width: 992px)');
  const covering = canExpand && panel.isExpanded && panel.stack.length > 0 && !frontIsPage;
  const sidebarShown = isSidebarOpen && !covering;
  // Opening the sidebar while the panel covers it restores the panel, so the sidebar and the content behind it come back.
  const toggleSidebar = () => {
    if (covering) {
      panel.toggleExpanded();
      setSidebarOpen(true);
    } else setSidebarOpen((open) => !open);
  };

  return (
    <Page
      // With the chat open, the page makes room for it from lg up (design system spec 4.1, Ask).
      className={chat.isOpen ? 'app-page app-page--chat-open' : 'app-page'}
      masthead={
        <AppMasthead
          isSidebarOpen={sidebarShown}
          onSidebarToggle={toggleSidebar}
          notifications={{ unread, isExpanded: isDrawerOpen, onToggle: () => setDrawerOpen((open) => !open) }}
        />
      }
      notificationDrawer={<NotificationsDrawer onClose={() => setDrawerOpen(false)} />}
      isNotificationDrawerExpanded={isDrawerOpen}
      sidebar={<AppSidebar isOpen={sidebarShown} route={route} home={home} onNavigate={() => !wide && setSidebarOpen(false)} />}
      // Page tracks its width, so the sidebar behaves as a drawer below xl. Crossing xl resets it: open when wide, closed when not.
      onPageResize={(_event, { mobileView }) => {
        if (mobileView === !wide) return;
        setWide(!mobileView);
        setSidebarOpen(!mobileView);
      }}
      // The main area scrolls, so keyboard users must be able to focus it.
      mainTabIndex={0}
      isContentFilled
    >
      {/* The content area is the object panel's drawer content, so the panel opens over it (design system spec 4.4). */}
      <PageSection isFilled hasBodyWrapper={false} padding={{ default: 'noPadding' }} className="app-content" aria-label={frontIsPage ? 'Process' : route.name === 'catalog' ? 'Design system catalog' : home === 'todo' ? 'To do' : home === 'glance' ? 'At a glance' : route.name === 'search' ? 'Search' : 'Objects'}>
        <ObjectDrawer>
          {!frontIsPage && route.name === 'catalog' && <CatalogPreview />}
          {!frontIsPage && home === 'todo' && <TodoView />}
          {!frontIsPage && home === 'glance' && <GlanceView key={route.name === 'glance' ? (route.initiative ?? '') : ''} initiative={route.name === 'glance' ? route.initiative : undefined} />}
          {!frontIsPage && route.name === 'type' && <TypeView key={route.type} type={route.type} />}
          {!frontIsPage && route.name === 'search' && <SearchView query={route.query} />}
          <ProcessHost />
        </ObjectDrawer>
      </PageSection>
      <ProcessDock />
    </Page>
  );
}
