import { describe, expect, it } from 'vitest';
import { NS } from './ontology/ontology';
import { routeHref, toAddress } from './routing';

// Addresses of type and metric lists (platform spec 5.1): the domain's types by name, as before, and the platform's own
// structure (platform spec 3.7) with its namespace's prefix.
describe('routes', () => {
  it('keeps the domain types’ addresses and prefixes the rest', () => {
    expect(routeHref({ name: 'type', type: `${NS.ls}StudyScenario` })).toBe('#/type/StudyScenario');
    expect(routeHref({ name: 'type', type: `${NS.p}ChangeSet` })).toBe('#/type/p:ChangeSet');
    expect(toAddress(`${NS.skos}ConceptScheme`)).toBe('skos:ConceptScheme');
    expect(routeHref({ name: 'metric', metric: `${NS.ls}Metric-ChangeSetsApplied` })).toBe('#/metric/Metric-ChangeSetsApplied');
  });
});
