// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateData } from '../ontology/methods';
import { loadOntology, SEED_FILE } from '../ontology/files';
import { select, type Graph } from '../ontology/ontology';

let graph: Graph;
beforeAll(() => {
  graph = loadOntology([readFileSync(SEED_FILE, 'utf8')]);
});
const count = (query: string) => Number(select(graph.store, `SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE { ${query} }`)[0].n);

describe('seed graph (domain spec section 11)', () => {
  it('conforms to every shape in the ontology', async () => {
    expect(await validateData(graph)).toEqual([]);
  });

  it('uses only the example namespace for its records', () => {
    expect(count(`?x ls:identifier ?id FILTER(!STRSTARTS(STR(?x), "https://example.org/lsh-data/"))`)).toBe(0);
  });

  it.each([
    ['5 compounds', `?x a ls:Compound`, 5],
    ['1 candidate', `?x ls:compoundStage lst:CompoundStage-candidate`, 1],
    ['2 analogs', `?x ls:derivedFrom ?parent`, 2],
    ['1 formulation', `?x a ls:Formulation`, 1],
    ['1 validated process', `?x ls:processStatus lst:ProcessStatus-validated`, 1],
    ['3 batches', `?x a ls:Batch`, 3],
    ['1 batch with high deviation risk', `?x ls:batchDeviationRisk lst:BatchDeviationRisk-high`, 1],
    ['1 blinded Phase II study', `?x ls:studyPhase lst:StudyPhase-ii ; ls:studyBlinding lst:StudyBlinding-blinded`, 1],
    ['3 sites', `?x a ls:Site`, 3],
    ['12 patients', `?x a ls:Patient`, 12],
    ['2 arms', `?p ls:assignedArm ?x`, 2],
    ['about 40 data records', `?x a ls:DataRecord`, 40],
    ['4 open queries', `?x ls:dataQueryStatus lst:DataQueryStatus-open`, 4],
    ['3 adverse events', `?x a ls:AdverseEvent`, 3],
    ['6 safety cases', `?x a ls:SafetyCase`, 6],
    ['1 investigational product', `?x ls:productStatus lst:ProductStatus-investigational`, 1],
    ['1 detected signal', `?x ls:signalStatus lst:SignalStatus-detected`, 1],
    ['3 cases in the signal', `?s ls:aggregates ?x`, 3],
    ['1 open quality event', `?x ls:qualityEventStatus lst:QualityEventStatus-open`, 1],
    ['1 submission in draft', `?x ls:submissionStatus lst:SubmissionStatus-draft`, 1],
    ['a person for each persona, a second Drug Safety Physician and an external agent', `?x a p:Person`, 6],
  ])('has %s', (_label, pattern, expected) => {
    expect(count(pattern)).toBe(expected);
  });

  it('links all six safety cases to the one product', () => {
    expect(count(`?x a ls:SafetyCase ; ls:concerns d:P-101`)).toBe(6);
  });

  it('has exactly one serious adverse event, not yet reported (J1 starts here)', () => {
    expect(count(`?x ls:adverseEventSeriousness lst:AdverseEventSeriousness-serious ; ls:adverseEventReporting lst:AdverseEventReporting-notReported`)).toBe(1);
  });
});
