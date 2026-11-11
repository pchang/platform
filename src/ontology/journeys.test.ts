// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { methodsFor, validateData } from './methods';
import { loadOntology } from './files';
import { NS } from './ontology';

/** Example graphs for the journeys in domain spec section 10. Fictional, like the seed graph. */
const PREFIX = `@prefix ls: <${NS.ls}> . @prefix lst: <${NS.lst}> . @prefix d: <https://example.org/lsh/data/> .\n`;
const D = (id: string) => `https://example.org/lsh/data/${id}`;

async function check(turtle: string, object: string, method: string, role?: string) {
  const graph = loadOntology([PREFIX + turtle]);
  expect(await validateData(graph), 'example graph conforms to the model').toEqual([]);
  const option = (await methodsFor(graph, D(object), role ? `${NS.ls}${role}` : undefined)).find((m) => m.label === method);
  expect(option, `${method} is offered on ${object}`).toBeDefined();
  return option!;
}

describe('J3: from manufacturing deviation to quarantine', () => {
  const batches = `
    d:B-0001 a ls:Batch ; ls:batchProduction lst:BatchProduction-complete ; ls:batchQuality lst:BatchQuality-pending .
    d:B-0002 a ls:Batch ; ls:batchProduction lst:BatchProduction-complete ; ls:batchQuality lst:BatchQuality-pending ; ls:batchDeviationRisk lst:BatchDeviationRisk-high .
    d:QE-0001 a ls:QualityEvent ; ls:raisedOn d:B-0002 ; ls:qualityEventStatus lst:QualityEventStatus-open .
    d:B-0003 a ls:Batch ; ls:batchProduction lst:BatchProduction-inProduction ; ls:batchQuality lst:BatchQuality-pending .`;

  it('offers Release batch on a complete, pending batch with no open quality event', async () => {
    expect(await check(batches, 'B-0001', 'Release batch')).toMatchObject({ available: true, blocks: [] });
  });

  it('blocks Release batch while a quality event is open (rule 3), and says why', async () => {
    expect(await check(batches, 'B-0002', 'Release batch')).toMatchObject({ available: false, blocks: ['An open quality event is raised on this batch'] });
  });

  it('offers Quarantine batch on the same batch', async () => {
    expect((await check(batches, 'B-0002', 'Quarantine batch')).available).toBe(true);
  });

  it('blocks Release batch before production is complete', async () => {
    expect((await check(batches, 'B-0003', 'Release batch')).blocks).toEqual(['Production is not complete']);
  });

  it('closes a quality event only once its CAPA is effective', async () => {
    const qe = `d:B-0002 a ls:Batch . d:QE-0001 a ls:QualityEvent ; ls:raisedOn d:B-0002 ; ls:qualityEventStatus lst:QualityEventStatus-capaAssigned .`;
    const inProgress = `${qe} d:CAPA-1 a ls:CAPA ; ls:resolves d:QE-0001 ; ls:capaStatus lst:CAPAStatus-inProgress .`;
    const effective = `${qe} d:CAPA-1 a ls:CAPA ; ls:resolves d:QE-0001 ; ls:capaStatus lst:CAPAStatus-effective .`;
    expect((await check(inProgress, 'QE-0001', 'Close quality event')).blocks).toEqual(['No effective CAPA resolves this quality event']);
    expect((await check(effective, 'QE-0001', 'Close quality event')).available).toBe(true);
  });
});

describe('J1: from trial adverse event to expedited report', () => {
  it('offers Report to safety on an event not yet reported, and not twice', async () => {
    const event = (reporting: string) => `d:AE-0001 a ls:AdverseEvent ; ls:adverseEventEntry lst:AdverseEventEntry-verified ; ls:adverseEventReporting lst:AdverseEventReporting-${reporting} .`;
    expect((await check(event('notReported'), 'AE-0001', 'Report to safety', 'ClinicalDataManager')).available).toBe(true);
    expect((await check(event('reportedToSafety'), 'AE-0001', 'Report to safety')).blocks).toEqual(['The event was already reported to safety']);
  });

  it('offers Prepare expedited report only for an assessed, serious, unexpected, related case', async () => {
    const assessed = (expectedness: string) => `d:SC-0007 a ls:SafetyCase ; ls:safetyCaseWorkflow lst:SafetyCaseWorkflow-assessed ;
      ls:safetyCaseSeriousness lst:SafetyCaseSeriousness-serious ; ls:safetyCaseExpectedness lst:SafetyCaseExpectedness-${expectedness} ;
      ls:safetyCaseCausality lst:SafetyCaseCausality-probable .`;
    expect((await check(assessed('unexpected'), 'SC-0007', 'Prepare expedited report', 'DrugSafetyPhysician')).available).toBe(true);
    expect((await check(assessed('expected'), 'SC-0007', 'Prepare expedited report')).blocks).toEqual(['The case is not unexpected']);
  });

  it('closes an assessed case only when no expedited report is required', async () => {
    const assessed = (seriousness: string) => `d:SC-0008 a ls:SafetyCase ; ls:safetyCaseWorkflow lst:SafetyCaseWorkflow-assessed ;
      ls:safetyCaseSeriousness lst:SafetyCaseSeriousness-${seriousness} ; ls:safetyCaseExpectedness lst:SafetyCaseExpectedness-unexpected ;
      ls:safetyCaseCausality lst:SafetyCaseCausality-possible .`;
    expect((await check(assessed('nonSerious'), 'SC-0008', 'Close case')).available).toBe(true);
    expect((await check(assessed('serious'), 'SC-0008', 'Close case')).available).toBe(false);
  });

  it('does not let the Clinical Data Manager assess a case', async () => {
    const triaged = `d:SC-0009 a ls:SafetyCase ; ls:safetyCaseWorkflow lst:SafetyCaseWorkflow-triaged .`;
    expect((await check(triaged, 'SC-0009', 'Assess', 'ClinicalDataManager')).blocks).toEqual(['Your role cannot run this method']);
    expect((await check(triaged, 'SC-0009', 'Assess', 'DrugSafetyPhysician')).available).toBe(true);
  });
});

describe('Edge case: unblinding inside J1 (rule 2)', () => {
  const trial = (seriousness: string, workflow = 'triaged') => `
    d:ST-0001 a ls:Study ; ls:studyBlinding lst:StudyBlinding-blinded .
    d:PT-0003 a ls:Patient ; ls:enrolledIn d:ST-0001 ; ls:patientArm lst:PatientArm-assigned ; ls:patientArmVisibility lst:PatientArmVisibility-hidden .
    d:AE-0001 a ls:AdverseEvent ; ls:experiencedBy d:PT-0003 .
    d:SC-0007 a ls:SafetyCase ; ls:originatesFrom d:AE-0001 ; ls:safetyCaseWorkflow lst:SafetyCaseWorkflow-${workflow} ;
      ls:safetyCaseSeriousness lst:SafetyCaseSeriousness-${seriousness} ; ls:safetyCaseExpectedness lst:SafetyCaseExpectedness-unexpected .`;
  const rule2 = 'Rule 2: unblinding needs a triaged safety case for this patient that is serious and unexpected';

  it('allows unblinding for a serious, unexpected, triaged case', async () => {
    expect(await check(trial('serious'), 'PT-0003', 'Unblind patient', 'DrugSafetyPhysician')).toMatchObject({ available: true });
  });

  it('blocks it for a non-serious case, and explains which condition failed', async () => {
    expect((await check(trial('nonSerious'), 'PT-0003', 'Unblind patient', 'DrugSafetyPhysician')).blocks).toEqual([rule2]);
  });

  it('blocks it when the study is not blinded, naming both reasons', async () => {
    const open = trial('nonSerious').replace('lst:StudyBlinding-blinded', 'lst:StudyBlinding-unblinded');
    expect((await check(open, 'PT-0003', 'Unblind patient')).blocks.sort()).toEqual([rule2, "The patient's study is not blinded"].sort());
  });

  it('blocks it before the case is triaged', async () => {
    expect((await check(trial('serious', 'received'), 'PT-0003', 'Unblind patient')).blocks).toEqual([rule2]);
  });

  it('never lets the Clinical Data Manager unblind', async () => {
    expect((await check(trial('serious'), 'PT-0003', 'Unblind patient', 'ClinicalDataManager')).available).toBe(false);
  });
});

describe('Clinical Development preconditions that follow links', () => {
  it('randomizes only into an enrolling study', async () => {
    const patient = (status: string) => `d:ST-0001 a ls:Study ; ls:studyStatus lst:StudyStatus-${status} .
      d:PT-0001 a ls:Patient ; ls:enrolledIn d:ST-0001 ; ls:patientEnrollment lst:PatientEnrollment-consented .`;
    expect((await check(patient('enrolling'), 'PT-0001', 'Randomize')).available).toBe(true);
    expect((await check(patient('planned'), 'PT-0001', 'Randomize')).blocks).toEqual(["The patient's study is not enrolling"]);
  });

  it('locks a study only when no query is open on its data', async () => {
    const study = (queryStatus: string) => `d:ST-0001 a ls:Study ; ls:studyStatus lst:StudyStatus-closed .
      d:PT-0001 a ls:Patient ; ls:enrolledIn d:ST-0001 . d:V-1 a ls:Visit ; ls:visitFor d:PT-0001 .
      d:DR-1 a ls:DataRecord ; ls:capturedAt d:V-1 . d:Q-1 a ls:DataQuery ; ls:raisedOn d:DR-1 ; ls:dataQueryStatus lst:DataQueryStatus-${queryStatus} .`;
    expect((await check(study('open'), 'ST-0001', 'Lock study', 'ClinicalDataManager')).blocks).toEqual(['The study has open data queries']);
    expect((await check(study('closed'), 'ST-0001', 'Lock study', 'ClinicalDataManager')).available).toBe(true);
  });
});

it('lists each method once, with every reason it is blocked', async () => {
  const graph = loadOntology([PREFIX + `d:B-0003 a ls:Batch ; ls:batchProduction lst:BatchProduction-inProduction ; ls:batchQuality lst:BatchQuality-released .`]);
  const options = await methodsFor(graph, D('B-0003'));
  expect(options.map((o) => o.label)).toEqual(['Open quality event', 'Quarantine batch', 'Release batch']);
  expect(options.find((o) => o.label === 'Release batch')!.blocks.sort()).toEqual(['Production is not complete', 'Quality is not pending']);
});

it('rejects data that breaks the model', async () => {
  const graph = loadOntology([PREFIX + `d:B-9 a ls:Batch ; ls:batchQuality lst:SignalStatus-confirmed .`]);
  expect((await validateData(graph)).length).toBeGreaterThan(0);
});
