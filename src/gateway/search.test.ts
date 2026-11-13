// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { createGatewayServer } from './http';
import { withSeed } from './node';
import { containsWords, interpret, type SearchVocabulary } from './search';

// Search (platform spec 5.2): a query read against the ontology, applied to what the principal may read.
vi.setConfig({ testTimeout: 30_000 });

const as = (person: string, role: string) => ({ person: `${NS.d}${person}`, role: `${NS.ls}${role}` });
const cdm = as('person-ben', 'ClinicalDataManager');
const dsp = as('person-chloe', 'DrugSafetyPhysician');
const chemist = as('person-ada', 'ComputationalChemist');

describe('reading a query', () => {
  const vocabulary: SearchVocabulary = {
    types: [
      { type: 'urn:AE', label: 'Adverse Event', pluralLabel: 'Adverse Events' },
      { type: 'urn:QE', label: 'Quality Event', pluralLabel: 'Quality Events' },
      { type: 'urn:SC', label: 'Safety Case', pluralLabel: 'Safety Cases' },
      { type: 'urn:Q', label: 'Data Query', pluralLabel: 'Data Queries' },
      { type: 'urn:ST', label: 'Study', pluralLabel: 'Studies' },
    ],
    states: [
      { dimension: 'urn:sc-ser', dimensionLabel: 'Seriousness', type: 'urn:SC', value: 'urn:serious', label: 'serious' },
      { dimension: 'urn:sc-ser', dimensionLabel: 'Seriousness', type: 'urn:SC', value: 'urn:non', label: 'non-serious' },
      { dimension: 'urn:q-st', dimensionLabel: 'Status', type: 'urn:Q', value: 'urn:q-open', label: 'open' },
      { dimension: 'urn:qe-st', dimensionLabel: 'Status', type: 'urn:QE', value: 'urn:qe-open', label: 'open' },
      { dimension: 'urn:st-ph', dimensionLabel: 'Phase', type: 'urn:ST', value: 'urn:i', label: 'I' },
    ],
    identifier: (w) => (w === 'p-101' ? { iri: 'urn:P-101', identifier: 'P-101' } : undefined),
  };

  it('reads full type names, the longest first', () => {
    expect(interpret('Safety Cases', vocabulary).types.map((t) => t.label)).toEqual(['Safety Case']);
  });

  it('reads the last word of a type name, singular or plural, keeping every type it fits', () => {
    expect(interpret('cases', vocabulary).types.map((t) => t.label)).toEqual(['Safety Case']);
    expect(interpret('queries', vocabulary).types.map((t) => t.label)).toEqual(['Data Query']);
    expect(interpret('event', vocabulary).types.map((t) => t.label)).toEqual(['Adverse Event', 'Quality Event']);
  });

  it('reads the longest state value, so non-serious is never serious', () => {
    expect(interpret('non-serious cases', vocabulary).states.map((s) => s.label)).toEqual(['non-serious']);
  });

  it('keeps only states of the types named', () => {
    const r = interpret('open queries', vocabulary);
    expect(r.states.map((s) => s.value)).toEqual(['urn:q-open']);
  });

  it('ignores one-letter state values, which are too easily typed by chance', () => {
    expect(interpret('i need studies', vocabulary).states).toEqual([]);
  });

  it('reads identifiers in any case, and leaves filler words out', () => {
    const r = interpret('Show me the cases for p-101', vocabulary);
    expect(r.identifiers).toEqual([{ iri: 'urn:P-101', identifier: 'P-101' }]);
    expect(r.types.map((t) => t.label)).toEqual(['Safety Case']);
    expect(r.words).toEqual([]);
  });

  it('keeps every other word to find in records', () => {
    expect(interpret('pneumonia hospital', vocabulary).words).toEqual(['pneumonia', 'hospital']);
  });

  it('finds words at the start of words, singular or plural', () => {
    expect(containsWords('Fever and cough; admitted to hospital with pneumonia', ['pneu', 'cough'])).toBe(true);
    expect(containsWords('Fever and cough', ['monia'])).toBe(false);
    expect(containsWords('Itchy rash on both forearms', ['rashes'])).toBe(true);
  });
});

describe('search through the gateway', () => {
  const g = withSeed();
  const ids = (q: string, who = cdm) => g.search(who, q).results.map((r) => r.object.identifier);

  it('finds an object by its identifier first', () => {
    const r = g.search(dsp, 'sc-003');
    expect(r.results[0]).toMatchObject({ object: { identifier: 'SC-003' }, matched: ['Identifier'] });
  });

  it('finds objects by type and state, and says how it read the query', () => {
    const r = g.search(cdm, 'serious adverse events');
    expect(r.interpretation.types.map((t) => t.label)).toEqual(['Adverse Event']);
    expect(r.interpretation.states.map((s) => `${s.dimensionLabel}: ${s.label}`)).toEqual(['Seriousness: serious']);
    expect(r.results.map((x) => x.object.identifier)).toEqual(['AE-003', 'AE-005']);
    expect(r.results[0].matched).toEqual(['Type: Adverse Event', 'Seriousness: serious']);
    expect(ids('open queries')).toEqual(['Q-01', 'Q-02', 'Q-03']);
  });

  it('finds objects of a type linked to an identified one, either way', () => {
    expect(ids('cases for P-101', dsp)).toEqual(['SC-001', 'SC-002', 'SC-003', 'SC-004', 'SC-005', 'SC-006']);
    expect(ids('scheduled visits PT-03')).toEqual(['V-03-3']);
    expect(g.search(cdm, 'scheduled visits PT-03').results[0].matched).toEqual(['Linked to PT-03', 'Type: Visit', 'Status: scheduled']);
  });

  it('finds words in records, and says where they matched', () => {
    const r = g.search(cdm, 'pneumonia');
    expect(r.results).toEqual([
      expect.objectContaining({ object: expect.objectContaining({ identifier: 'AE-005' }), matched: ['verbatim term: Fever and cough; admitted to hospital with pneumonia'] }),
    ]);
    expect(ids('rash', dsp)).toEqual(['AE-002', 'SC-002', 'SC-004', 'SC-005', 'SC-006', 'SC-111']);
  });

  it('never matches what the principal may not read', () => {
    // Patients' arms are hidden while the study is blinded (rule 2), and the chemist may not read clinical records.
    expect(ids('arm')).toEqual([]);
    expect(g.search(cdm, 'B').results.some((r) => r.object.type === `${NS.ls}Patient` && r.matched.some((m) => m.startsWith('assigned arm')))).toBe(false);
    expect(ids('pneumonia', chemist)).toEqual([]);
    expect(ids('AE-005', chemist)).toEqual([]);
    // "events" still finds the types the chemist may read, such as Quality Events, and never Adverse Events.
    expect(g.search(chemist, 'adverse events').interpretation.types.map((t) => t.label)).toEqual(['Quality Event']);
    expect(ids('adverse events', chemist)).toEqual([]);
  });

  it('records a match in personal data as a read, and nothing for other matches', () => {
    const fresh = withSeed();
    const before = fresh.reads().length;
    fresh.search(cdm, 'serious adverse events');
    expect(fresh.reads().length).toBe(before);
    fresh.search(cdm, 'pneumonia');
    expect(fresh.reads().slice(before)).toEqual([expect.objectContaining({ person: cdm.person, object: `${NS.d}AE-005` })]);
  });

  it('answers nothing for an empty query or filler words only', () => {
    expect(g.search(cdm, '   ')).toMatchObject({ results: [], total: 0 });
    expect(g.search(cdm, 'show me the').results).toEqual([]);
  });

  it('limits the results and gives the total', () => {
    const r = g.search(dsp, 'cases', 5);
    expect(r.results).toHaveLength(5);
    expect(r.total).toBe(26);
  });

  it('answers over HTTP', async () => {
    const server = createGatewayServer(withSeed(), { developmentMode: true });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/search?q=${encodeURIComponent('open queries')}`, {
        headers: { 'x-lsh-person': 'person-ben', 'x-lsh-role': 'ClinicalDataManager' },
      });
      expect((await res.json()).results.map((r: { object: { identifier: string } }) => r.object.identifier)).toEqual(['Q-01', 'Q-02', 'Q-03']);
    } finally {
      server.close();
    }
  });
});
