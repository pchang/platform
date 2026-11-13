// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NS, select } from '../ontology/ontology';
import { loadOntology } from '../ontology/files';
import { templateProperties } from '../ontology/titles';
import { withSeed } from './node';

// Titles (platform spec 3.1, Title; domain spec section 9): how each type names its objects for people.
vi.setConfig({ testTimeout: 30_000 });

const ls = (n: string) => `${NS.ls}${n}`;
const as = (person: string, role: string) => ({ person: `${NS.d}${person}`, role: ls(role) });
const dsp = as('person-chloe', 'DrugSafetyPhysician');
const cdm = as('person-ben', 'ClinicalDataManager');
const quality = as('person-elena', 'QualityLead');
const chemist = as('person-ada', 'ComputationalChemist');

describe('titles from the ontology', () => {
  const g = withSeed();
  const title = (who: typeof dsp, id: string) => g.read(who, id).title;

  it.each([
    [chemist, 'C-101', 'LSH-4471, JAK1 inhibitor'],
    [chemist, 'SIM-1', 'ADMET prediction for LSH-4471, JAK1 inhibitor'],
    [chemist, 'EXP-2', 'Thermodynamic solubility study, LSH-4388, JAK1 inhibitor'],
    [chemist, 'AR-1', 'JAK1 IC50 4.2 nM'],
    [quality, 'B-002', 'Lot VL25-2410-02'],
    [quality, 'QE-1', 'Tablet hardness below specification in lot VL25-2410-02'],
    [cdm, 'ST-01', 'VELOCITY-2: Velcorin in moderate to severe rheumatoid arthritis'],
    [cdm, 'SITE-2', 'Lakeside Clinical Research Center'],
    [cdm, 'PT-03', "Patient at St. Brendan's University Hospital"],
    [cdm, 'V-03-3', 'Week 12 visit for PT-03'],
    [cdm, 'DR-003', 'Body weight 71.2 kg'],
    [cdm, 'Q-01', 'Units missing for this value; please confirm against the source'],
    [cdm, 'AE-005', 'Fever and cough; admitted to hospital with pneumonia'],
    [dsp, 'SC-002', 'Skin rash, nausea with Velcorin 25 mg tablets'],
    [dsp, 'SIG-1', 'Drug-induced liver injury with Velcorin 25 mg tablets'],
    [dsp, 'SUB-1', 'Expedited report for SC-003'],
    [dsp, 'MI-3', 'Rash and nausea in the first week of Velcorin: report or wait?'],
  ])('%#: %s is titled', (who, id, expected) => {
    expect(title(who, id)).toBe(expected);
  });

  it('gives every type a template, and every object in the seed a title of its own', () => {
    const graph = loadOntology();
    expect(select(graph.store, `SELECT ?type WHERE { ?type a p:ObjectType FILTER NOT EXISTS { ?type p:titleTemplate ?t } }`)).toEqual([]);
    const sample = withSeed();
    // The Drug Safety Physician may read every type, so every object is checked.
    for (const { t } of select(graph.store, `SELECT ?t WHERE { ?t a p:ObjectType }`)) {
      for (const o of sample.find(dsp, t)) expect(o.title, o.identifier).not.toBe(o.typeLabel);
    }
  });

  it('titles objects people create, by the next alternative when the first lacks values', async () => {
    const fresh = withSeed();
    const reported = await fresh.commit(as('person-ben', 'ClinicalDataManager'), 'AE-003', ls('ReportToSafety'));
    expect(fresh.read(dsp, reported.created[0]).title).toBe('Case from AE-003');
    const raised = await fresh.commit(as('person-priya', 'ClinicalResearchAssociate'), 'DR-028', ls('RaiseQuery'), { question: 'Please confirm the units' });
    expect(fresh.read(cdm, raised.created[0]).title).toBe('Please confirm the units');
    const opened = await fresh.commit(quality, 'B-003', ls('OpenQualityEvent'), { description: 'Coating defects seen in lot VL25-2411-03', severity: `${NS.lst}QualityEventSeverity-minor` });
    expect(fresh.read(quality, opened.created[0]).title).toBe('Coating defects seen in lot VL25-2411-03');
  });

  it('never uses a value any role or rule hides', () => {
    const graph = loadOntology();
    const hidden = new Set(select(graph.store, `SELECT ?x WHERE { { ?role p:mayNotRead ?x } UNION { ?rule p:hides ?x } }`).map((r) => r.x));
    for (const { type, t } of select(graph.store, `SELECT ?type ?t WHERE { ?type p:titleTemplate ?t }`)) {
      for (const property of templateProperties(t)) expect(hidden.has(property), `${type} uses ${property}`).toBe(false);
    }
  });
});
