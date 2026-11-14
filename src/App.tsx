import { Page, PageSection } from '@patternfly/react-core';
import { useState } from 'react';
import { CatalogPreview } from './catalog/CatalogPreview';
import { AppMasthead } from './chrome/AppMasthead';
import { AppSidebar } from './chrome/AppSidebar';
import { NotificationsDrawer } from './chrome/NotificationsDrawer';
import { NotificationsProvider, useNotifications } from './notifications/NotificationsProvider';
import { ObjectDrawer } from './objects/ObjectPanel';
import { ObjectPanelProvider } from './objects/ObjectPanelProvider';
import { ProcessDock } from './chrome/ProcessDock';
import { ProcessHost, useFrontIsPage } from './processes/ProcessHost';
import { ProcessProvider } from './processes/ProcessProvider';
import { useRoute } from './routing';
import { SearchView, TodoView, TypeView } from './views/OrientViews';

/** From PatternFly's xl breakpoint up, the sidebar sits beside the content; below it, it is a drawer (design system spec 4.1). */
const isWide = () => window.innerWidth >= 1200;

/** The Page template: masthead and sidebar chrome, with the current view in the main area. */
export function App() {
  return (
    <NotificationsProvider>
      <ProcessProvider>
        <ObjectPanelProvider>
          <AppPage />
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

  return (
    <Page
      className="app-page"
      masthead={
        <AppMasthead
          isSidebarOpen={isSidebarOpen}
          onSidebarToggle={() => setSidebarOpen((open) => !open)}
          notifications={{ unread, isExpanded: isDrawerOpen, onToggle: () => setDrawerOpen((open) => !open) }}
          searchQuery={route.name === 'search' ? route.query : undefined}
        />
      }
      notificationDrawer={<NotificationsDrawer onClose={() => setDrawerOpen(false)} />}
      isNotificationDrawerExpanded={isDrawerOpen}
      sidebar={<AppSidebar isOpen={isSidebarOpen} route={route} onNavigate={() => !wide && setSidebarOpen(false)} />}
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
      <PageSection isFilled hasBodyWrapper={false} padding={{ default: 'noPadding' }} className="app-content" aria-label={frontIsPage ? 'Process' : route.name === 'catalog' ? 'Design system catalog' : route.name === 'todo' ? 'To do' : route.name === 'search' ? 'Search' : 'Objects'}>
        <ObjectDrawer>
          {!frontIsPage && route.name === 'catalog' && <CatalogPreview />}
          {!frontIsPage && route.name === 'todo' && <TodoView />}
          {!frontIsPage && route.name === 'type' && <TypeView key={route.type} type={route.type} />}
          {!frontIsPage && route.name === 'search' && <SearchView query={route.query} />}
          <ProcessHost />
        </ObjectDrawer>
      </PageSection>
      <ProcessDock />
    </Page>
  );
}
