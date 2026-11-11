// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { archetypeOf, archetypes, ruleNames } from './archetypes';
import { loadOntology } from './files';
import { NS, select } from './ontology';

const graph = loadOntology();
const read = (file: string) => readFileSync(join(import.meta.dirname, '../../spec', file), 'utf8');
/** The rows of the first table after a heading. */
function table(spec: string, heading: string): string[][] {
  const section = spec.split(heading)[1];
  const lines = section.split('\n');
  const start = lines.findIndex((l) => l.startsWith('|'));
  const rows: string[][] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(line.split('|').slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}

describe('interaction archetypes (platform spec 5.4)', () => {
  it('are the eight in the platform spec, in its rule order, each with a rule', () => {
    const spec = table(read('ai-native-platform-spec.md'), '#### Running a method: interaction archetypes').map(([label]) => label);
    expect(archetypes(graph.store).map((a) => a.label)).toEqual(spec);
    expect(archetypes(graph.store).map((a) => a.archetype.slice(NS.p.length)).sort()).toEqual([...ruleNames].sort());
  });

  it('each have one pattern in the design system spec', () => {
    const patterns = table(read('design-system.md'), 'Each interaction archetype has one pattern.').map(([label]) => label);
    expect(patterns.sort()).toEqual(archetypes(graph.store).map((a) => a.label).sort());
  });

  it('give every method exactly the archetype the domain spec lists', () => {
    const listed = table(read('domain-life-sciences.md'), '### Interaction archetypes');
    expect(listed).toHaveLength(35);
    for (const [method, on, archetype] of listed) {
      const iri = select(graph.store, `SELECT ?m WHERE { ?m a p:Method ; rdfs:label "${method}" ; p:appliesTo/rdfs:label "${on}" }`)[0]?.m;
      expect(iri, method).toBeDefined();
      expect(archetypeOf(graph.store, iri).label, method).toBe(archetype);
    }
  });

  it('honor an override in the ontology before the rules', () => {
    const overridden = loadOntology([`@prefix p: <${NS.p}> . @prefix ls: <${NS.ls}> . ls:LockStudy p:archetype p:ReviewAndSign .`]);
    expect(archetypeOf(overridden.store, `${NS.ls}LockStudy`).label).toBe('Review and sign');
    expect(archetypeOf(graph.store, `${NS.ls}LockStudy`).label).toBe('Confirm');
  });

  it('use no overrides in the life sciences domain', () => {
    expect(select(graph.store, `SELECT ?m WHERE { ?m p:archetype ?a }`)).toEqual([]);
  });
});
