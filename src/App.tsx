import { Page, PageSection } from '@patternfly/react-core';
import { CatalogPreview } from './catalog/CatalogPreview';
import { AppMasthead } from './chrome/AppMasthead';
import { useRoute } from './routing';

/** The Page template frame. Views composed by agents will fill the main area. */
export function App() {
  const route = useRoute();
  return (
    <Page masthead={<AppMasthead />} isContentFilled>
      <PageSection isFilled aria-label={route === 'catalog' ? 'Design system catalog' : 'Main content'}>
        {route === 'catalog' && <CatalogPreview />}
      </PageSection>
    </Page>
  );
}
