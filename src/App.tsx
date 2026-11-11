import { Page, PageSection } from '@patternfly/react-core';
import { useState } from 'react';
import { CatalogPreview } from './catalog/CatalogPreview';
import { AppMasthead } from './chrome/AppMasthead';
import { AppSidebar } from './chrome/AppSidebar';
import { NotificationsDrawer } from './chrome/NotificationsDrawer';
import { NotificationsProvider, useNotifications } from './notifications/NotificationsProvider';
import { useRoute } from './routing';
import { TodoView, TypeView } from './views/OrientViews';

/** From PatternFly's xl breakpoint up, the sidebar sits beside the content; below it, it is a drawer (design system spec 4.1). */
const isWide = () => window.innerWidth >= 1200;

/** The Page template: masthead and sidebar chrome, with the current view in the main area. */
export function App() {
  return (
    <NotificationsProvider>
      <AppPage />
    </NotificationsProvider>
  );
}

function AppPage() {
  const route = useRoute();
  const [wide, setWide] = useState(isWide);
  const [isSidebarOpen, setSidebarOpen] = useState(wide);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const { unread } = useNotifications();

  return (
    <Page
      masthead={
        <AppMasthead
          isSidebarOpen={isSidebarOpen}
          onSidebarToggle={() => setSidebarOpen((open) => !open)}
          notifications={{ unread, isExpanded: isDrawerOpen, onToggle: () => setDrawerOpen((open) => !open) }}
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
      <PageSection isFilled aria-label={route.name === 'catalog' ? 'Design system catalog' : route.name === 'todo' ? 'To do' : 'Objects'}>
        {route.name === 'catalog' && <CatalogPreview />}
        {route.name === 'todo' && <TodoView />}
        {route.name === 'type' && <TypeView key={route.type} type={route.type} />}
      </PageSection>
    </Page>
  );
}
