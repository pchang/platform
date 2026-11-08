import { Page, PageSection } from '@patternfly/react-core';
import { AppMasthead } from './chrome/AppMasthead';

/** The Page template frame. Views composed by agents will fill the main area. */
export function App() {
  return (
    <Page masthead={<AppMasthead />} isContentFilled>
      <PageSection isFilled aria-label="Main content" />
    </Page>
  );
}
