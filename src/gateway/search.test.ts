// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { NS } from '../ontology/ontology';
import { createGatewayServer } from './http';
import { withSeed } from './node';
import { searchModelFromEnvironment } from './anthropicSearch';
import { containsWords, interpret, type SearchModel, type SearchPlan, type SearchPlanRequest, type SearchVocabulary } from './search';

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
  const ids = async (q: string, who = cdm) => (await g.search(who, q)).results.map((r) => r.object.identifier);

  it('finds an object by its identifier first', async () => {
    const r = await g.search(dsp, 'sc-003');
    expect(r.results[0]).toMatchObject({ object: { identifier: 'SC-003' }, matched: ['Identifier'] });
    expect(r.understoodBy).toEqual({ ontology: true });
  });

  it('finds objects by type and state, and says how it read the query', async () => {
    const r = await g.search(cdm, 'serious adverse events');
    expect(r.interpretation.types.map((t) => t.label)).toEqual(['Adverse Event']);
    expect(r.interpretation.states.map((s) => `${s.dimensionLabel}: ${s.label}`)).toEqual(['Seriousness: serious']);
    expect(r.results.map((x) => x.object.identifier)).toEqual(['AE-003', 'AE-005']);
    expect(r.results[0].matched).toEqual(['Type: Adverse Event', 'Seriousness: serious']);
    expect(await ids('open queries')).toEqual(['Q-01', 'Q-02', 'Q-03']);
  });

  it('finds objects of a type linked to an identified one, either way', async () => {
    expect(await ids('cases for P-101', dsp)).toEqual(['SC-001', 'SC-002', 'SC-003', 'SC-004', 'SC-005', 'SC-006']);
    expect(await ids('scheduled visits PT-03')).toEqual(['V-03-3']);
    expect((await g.search(cdm, 'scheduled visits PT-03')).results[0].matched).toEqual(['Linked to PT-03', 'Type: Visit', 'Status: scheduled']);
  });

  it('finds words in records, and says where they matched', async () => {
    const r = await g.search(cdm, 'pneumonia');
    expect(r.results).toEqual([
      expect.objectContaining({ object: expect.objectContaining({ identifier: 'AE-005' }), matched: ['verbatim term: Fever and cough; admitted to hospital with pneumonia'] }),
    ]);
    expect(await ids('rash', dsp)).toEqual(['AE-002', 'MI-3', 'MI-4', 'SC-002', 'SC-004', 'SC-005', 'SC-006', 'SC-111']);
  });

  it('reads "my" as the principal’s own objects: work waiting for them, or objects that name them', async () => {
    const crc = { person: `${NS.d}person-sam`, role: `${NS.ls}ClinicalResearchCoordinator` };
    expect(await ids('list all of my queries', crc)).toEqual(['Q-01', 'Q-02', 'Q-03']);
    expect(await ids('list all of my queries')).toEqual(['Q-04', 'Q-05', 'Q-06']);
    const mine = await g.search(dsp, 'my submissions');
    expect(mine.interpretation.mine).toBe(true);
    expect(mine.results.map((r) => [r.object.identifier, r.matched[0]])).toEqual([['SUB-1', 'Yours: waiting for you']]);
    // To do follows the role: SUB-1 waits for any Drug Safety Physician, so for Dev too, though only Chloé prepared it.
    expect(await ids('my submissions', { person: `${NS.d}person-dev`, role: `${NS.ls}DrugSafetyPhysician` })).toEqual(['SUB-1']);
    // A Clinical Data Manager has no submission waiting and none that names them.
    expect(await ids('my submissions')).toEqual([]);
  });

  it('never matches what the principal may not read', async () => {
    // Patients' arms are hidden while the study is blinded (rule 2), and the chemist may not read clinical records.
    expect(await ids('arm')).toEqual([]);
    expect((await g.search(cdm, 'B')).results.some((r) => r.object.type === `${NS.ls}Patient` && r.matched.some((m) => m.startsWith('assigned arm')))).toBe(false);
    expect(await ids('pneumonia', chemist)).toEqual([]);
    expect(await ids('AE-005', chemist)).toEqual([]);
    // "events" still finds the types the chemist may read, such as Quality Events, and never Adverse Events.
    expect((await g.search(chemist, 'adverse events')).interpretation.types.map((t) => t.label)).toEqual(['Quality Event']);
    expect(await ids('adverse events', chemist)).toEqual([]);
  });

  it('records a match in personal data as a read, and nothing for other matches', async () => {
    const fresh = withSeed();
    const before = fresh.reads().length;
    await fresh.search(cdm, 'serious adverse events');
    expect(fresh.reads().length).toBe(before);
    await fresh.search(cdm, 'pneumonia');
    expect(fresh.reads().slice(before)).toEqual([expect.objectContaining({ person: cdm.person, object: `${NS.d}AE-005` })]);
  });

  it('answers nothing for an empty query or filler words only', async () => {
    expect(await g.search(cdm, '   ')).toMatchObject({ results: [], total: 0 });
    expect((await g.search(cdm, 'show me the')).results).toEqual([]);
  });

  it('limits the results and gives the total', async () => {
    const r = await g.search(dsp, 'cases', { limit: 5 });
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

describe('search understood by a connected model (platform spec 5.2)', () => {
  /** A test double for the connected model: records what it was given and answers with a fixed plan. The product never uses one. */
  class PlanningModel implements SearchModel {
    readonly model = 'test-planner';
    readonly requests: SearchPlanRequest[] = [];
    constructor(private readonly answer: (r: SearchPlanRequest) => SearchPlan | Error) {}
    async plan(request: SearchPlanRequest) {
      this.requests.push(request);
      const a = this.answer(request);
      if (a instanceof Error) throw a;
      return a;
    }
  }
  const type = (name: string) => `${NS.ls}${name}`;

  it('runs the plan the model makes, and says the model understood it', async () => {
    const model = new PlanningModel(() => ({ types: [type('DataQuery')], states: [], identifiers: [], words: [], mine: true }));
    const g = withSeed([], { searchModel: model });
    const r = await g.search(cdm, 'what queries are on my plate?');
    expect(r.understoodBy).toEqual({ model: 'test-planner' });
    expect(r.results.map((x) => x.object.identifier)).toEqual(['Q-04', 'Q-05', 'Q-06']);
  });

  it('gives the model the vocabulary and who is asking, and never a record', async () => {
    const model = new PlanningModel(() => ({ types: [], states: [], identifiers: ['AE-005'], words: [], mine: false }));
    const g = withSeed([], { searchModel: model });
    await g.search(cdm, 'tell me about ae-005 and its pneumonia');
    const [request] = model.requests;
    expect(request.person).toEqual({ name: 'Ben Okafor', role: 'Clinical Data Manager' });
    expect(request.types.map((t) => t.name)).toContain('Data Query');
    expect(request.states).toContainEqual(expect.objectContaining({ dimension: 'Seriousness', value: 'serious' }));
    expect(request.relationships).toContain('experienced by');
    expect(request.identifiers).toEqual(['AE-005']);
    // Nothing from any record: no verbatim terms, no values, no titles.
    expect(JSON.stringify(request)).not.toMatch(/Fever and cough|Velcorin|Northfield|Heart rate/);
    // The chemist may not read adverse events, so their model never hears of the type.
    const chemists = new PlanningModel(() => ({ types: [], states: [], identifiers: [], words: ['x'], mine: false }));
    await withSeed([], { searchModel: chemists }).search(chemist, 'adverse events');
    expect(chemists.requests[0].types.map((t) => t.name)).not.toContain('Adverse Event');
  });

  it('drops anything in the plan outside what the principal may read', async () => {
    const model = new PlanningModel(() => ({
      types: [type('AdverseEvent'), 'urn:not-a-type'],
      states: [`${NS.lst}AdverseEventSeriousness-serious`, 'urn:not-a-state'],
      identifiers: ['AE-005', 'NOPE-1'],
      words: ['pneumonia', 'two words'],
      mine: false,
    }));
    const r = await withSeed([], { searchModel: model }).search(cdm, 'serious things');
    expect(r.interpretation.types.map((t) => t.label)).toEqual(['Adverse Event']);
    expect(r.interpretation.states.map((s) => s.label)).toEqual(['serious']);
    expect(r.interpretation.identifiers.map((i) => i.identifier)).toEqual(['AE-005']);
    expect(r.interpretation.words).toEqual(['pneumonia']);
    // The chemist's plan cannot reach types the chemist may not read, whatever the model says.
    const forChemist = await withSeed([], { searchModel: model }).search(chemist, 'serious things');
    expect(forChemist.results).toEqual([]);
  });

  it('reads the query against the ontology when the model fails or declines, and says so', async () => {
    const g = withSeed([], { searchModel: new PlanningModel(() => new Error('The model declined')) });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await g.search(cdm, 'open queries');
    warn.mockRestore();
    expect(r.understoodBy).toEqual({ ontology: true });
    expect(r.results.map((x) => x.object.identifier)).toEqual(['Q-01', 'Q-02', 'Q-03']);
  });

  it('can be asked to read with the ontology only, as the suggestions under the field are', async () => {
    const model = new PlanningModel(() => ({ types: [], states: [], identifiers: [], words: [], mine: false }));
    const r = await withSeed([], { searchModel: model }).search(cdm, 'open queries', { understand: 'ontology' });
    expect(model.requests).toEqual([]);
    expect(r.understoodBy).toEqual({ ontology: true });
  });

  const key = process.env.LSH_ANTHROPIC_API_KEY;
  it.skipIf(!key)('understands "list all of my queries" with Claude (live, when LSH_ANTHROPIC_API_KEY is set)', async () => {
    const r = await withSeed([], { searchModel: searchModelFromEnvironment() }).search(cdm, 'list all of my queries');
    expect(r.understoodBy).toMatchObject({ model: expect.stringMatching(/^claude-/) });
    expect(r.results.map((x) => x.object.identifier)).toEqual(['Q-04', 'Q-05', 'Q-06']);
  }, 120_000);
});
