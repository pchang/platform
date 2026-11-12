import { Button, Card, CardBody, Content, Flex, FlexItem, PageSection, Progress, ProgressSize, Title } from '@patternfly/react-core';
import TimesIcon from '@patternfly/react-icons/dist/esm/icons/times-icon';
import { useProcesses } from '../processes/ProcessProvider';
import { processTitle } from '../processes/processes';
import './ProcessDock.css';

/**
 * The process dock (design system spec 4.1): processes set aside, along the bottom of the page, each with its progress
 * by archetype. Choosing one brings it back in front; closing one ends it without committing anything. Shown only while
 * something is in it. The entries scroll sideways inside the dock, never the page.
 */
export function ProcessDock() {
  const { docked, restore, close } = useProcesses();
  if (!docked.length) return null;
  return (
    <PageSection stickyOnBreakpoint={{ default: 'bottom' }} padding={{ default: 'noPadding' }} aria-label="Processes set aside" className="app-process-dock">
      <Title headingLevel="h2" size="md" className="app-process-dock__title">
        Set aside ({docked.length})
      </Title>
      <ul className="app-process-dock__list">
        {docked.map((p) => {
          const title = processTitle(p);
          return (
            <li key={p.id} className="app-process-dock__item">
              <Card isCompact className="app-process-dock__card">
                <CardBody>
                  <Flex flexWrap={{ default: 'nowrap' }} alignItems={{ default: 'alignItemsFlexStart' }} gap={{ default: 'gapSm' }}>
                    <FlexItem grow={{ default: 'grow' }}>
                      <Button variant="link" isInline onClick={() => restore(p.id)}>
                        {title}
                      </Button>
                      <Progress
                        size={ProgressSize.sm}
                        value={p.progress.fraction === null ? undefined : Math.round(p.progress.fraction * 100)}
                        measureLocation="none"
                        aria-label={`${title}: ${p.progress.words}`}
                        variant={p.progress.status}
                        {...(p.progress.fraction === null ? { valueText: p.progress.words } : {})}
                      />
                      <Content component="small">{p.progress.words}</Content>
                    </FlexItem>
                    <Button variant="plain" icon={<TimesIcon />} aria-label={`Close ${title}`} onClick={() => close(p.id)} />
                  </Flex>
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}
