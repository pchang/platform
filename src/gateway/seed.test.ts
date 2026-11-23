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
    ['3 sites running the study', `?s a ls:Study ; ls:runsAt ?x`, 3],
    ['12 patients', `?x a ls:Patient`, 12],
    ['2 arms', `?p ls:assignedArm ?x`, 2],
    ['about 40 data records', `?x a ls:DataRecord`, 40],
    ['14 data records awaiting source data verification', `?x ls:dataRecordEntry lst:DataRecordEntry-entered`, 14],
    ['30 visits', `?x a ls:Visit`, 30],
    ['10 scheduled visits, each with a date', `?x ls:visitStatus lst:VisitStatus-scheduled ; ls:scheduledOn ?d`, 10],
    ['2 overdue visits on November 12, 2026', `?x ls:visitStatus lst:VisitStatus-scheduled ; ls:scheduledOn ?d FILTER(?d < "2026-11-12"^^xsd:date)`, 2],
    ['1 consented and 1 screened patient', `?x ls:patientEnrollment ?e FILTER(?e IN (lst:PatientEnrollment-consented, lst:PatientEnrollment-screened))`, 2],
    ['3 open queries', `?x ls:dataQueryStatus lst:DataQueryStatus-open`, 3],
    ['3 answered queries', `?x ls:dataQueryStatus lst:DataQueryStatus-answered`, 3],
    ['5 adverse events', `?x a ls:AdverseEvent`, 5],
    ['2 adverse events awaiting reconciliation', `?x ls:adverseEventReporting lst:AdverseEventReporting-reportedToSafety`, 2],
    ['2 adverse events awaiting verification', `?x ls:adverseEventEntry lst:AdverseEventEntry-entered`, 2],
    ['every adverse event in the site’s words', `?x a ls:AdverseEvent FILTER NOT EXISTS { ?x ls:verbatimTerm ?t }`, 0],
    ['6 safety cases on the investigational product', `?x a ls:SafetyCase ; ls:concerns ?p . ?p ls:productStatus lst:ProductStatus-investigational`, 6],
    ['each case coded with its reactions', `?x a ls:SafetyCase FILTER NOT EXISTS { ?x ls:reaction ?r }`, 0],
    ['1 approved comparator product', `?x ls:productStatus lst:ProductStatus-approved`, 1],
    ['20 closed comparator cases', `?x ls:concerns ?p ; ls:safetyCaseWorkflow lst:SafetyCaseWorkflow-closed . ?p ls:productStatus lst:ProductStatus-approved`, 20],
    ['1 investigational product', `?x ls:productStatus lst:ProductStatus-investigational`, 1],
    ['1 detected signal', `?x ls:signalStatus lst:SignalStatus-detected`, 1],
    ['3 cases in the signal', `?s ls:aggregates ?x`, 3],
    ['a signal for drug-induced liver injury', `?x a ls:Signal ; ls:reaction lst:Reaction-drugInducedLiverInjury`, 1],
    ['1 open quality event', `?x ls:qualityEventStatus lst:QualityEventStatus-open`, 1],
    ['1 submission in draft', `?x ls:submissionStatus lst:SubmissionStatus-draft`, 1],
    ['a person for each persona, a second Drug Safety Physician, an external agent and a Structure Steward', `?x a p:Person`, 15],
    // Design and Plan (domain spec section 3.4)
    ['1 program, developing the candidate', `?x a ls:Program ; ls:develops ?c . ?c ls:compoundStage lst:CompoundStage-candidate`, 1],
    ['an endorsed target product profile', `?x ls:targetProductProfileStatus lst:TargetProductProfileStatus-endorsed`, 1],
    ['3 opportunities: a new asset, a parked indication and a scientific question', `?x a ls:Opportunity`, 3],
    ['2 opportunities before any program: the new asset and the scientific question', `?x a ls:Opportunity FILTER NOT EXISTS { ?x ls:informs ?p }`, 2],
    ['a new-asset opportunity evaluating the two analogs from discovery', `?o ls:opportunityKind lst:OpportunityKind-newAsset ; ls:evaluates ?x . ?x ls:derivedFrom ?parent`, 2],
    ['2 development options for the new asset', `?x ls:optionFor ?o . ?o ls:opportunityKind lst:OpportunityKind-newAsset`, 2],
    ['a simulated development option, with its chance of success, time and cost', `?x ls:forecastFrom/ls:simulates ?o . ?o a ls:DevelopmentOption`, 3],
    ['2 study concepts: VELOCITY-3 in the program, and first-in-human for the new asset', `?x a ls:StudyConcept`, 2],
    ['3 study scenarios exploring the VELOCITY-3 study concept', `?x ls:explores ?c . ?c a ls:StudyConcept`, 3],
    ['1 study scenario exploring a running study', `?x ls:explores ?s . ?s a ls:Study`, 1],
    ['every study concept scenario with a protocol, a budget and a site selection', `?x ls:explores ?c . ?c a ls:StudyConcept FILTER NOT EXISTS { ?x ls:usesProtocol ?p ; ls:usesBudget ?b ; ls:usesSiteSelection ?s }`, 0],
    ['4 outcome targets', `?x a ls:OutcomeTarget`, 4],
    ['7 eligibility criteria in the baseline protocol', `?x ls:defines/ls:specifiedIn d:PROT-31`, 7],
    ['a complete estimand for the primary objective of each VELOCITY-3 protocol', `?x ls:estimandCompleteness lst:EstimandCompleteness-complete ; ls:estimandOf/ls:objectiveLevel lst:ObjectiveLevel-primary`, 3],
    ['6 planned visits in each VELOCITY-3 protocol', `?x a ls:PlannedVisit`, 18],
    ['hand MRI, with no recorded purpose, in two of the three protocols', `?x ls:assessmentPurpose lst:AssessmentPurpose-noneRecorded`, 2],
    ['3 budgets with a ceiling, each with the total its simulation set: two over it, one within', `?x ls:budgetCeiling ?c ; ls:budgetTotal ?t`, 3],
    ['10 proposed sites, standing for 250 sites', `?x a ls:ProposedSite`, 10],
    ['sites in Ireland, Poland and Brazil without MRI', `?x a ls:ProposedSite FILTER NOT EXISTS { ?x ls:equipment "MRI" }`, 5],
    ['VELOCITY-3’s 3 study scenarios each simulated once, by the reference model', `?x ls:simulates/ls:explores d:STC-1`, 3],
    ['6 current forecasts for each simulated scenario, and 3 for the new asset’s development option', `?x a ls:Forecast ; ls:forecastCurrency lst:ForecastCurrency-current`, 21],
    ['4 forecasts missing their target: the baseline’s time and cost, the prior biologic scenario’s cost and chance of success', `?x ls:forecastAgainstTarget lst:ForecastAgainstTarget-missed`, 4],
    ['each variant protocol structured like the baseline, with its one change', `?x ls:specifiedIn ?p . ?p ls:protocolName ?n FILTER(CONTAINS(?n, "variant"))`, 39],
    ['4 raised design signals: 2 from history, 2 from the simulations on the Irish sites without MRI', `?x ls:designSignalStatus lst:DesignSignalStatus-raised`, 4],
    ['1 contribution awaiting confirmation', `?x ls:contributionMapping lst:ContributionMapping-proposed`, 1],
    ['1 decision, parking an opportunity', `?x ls:decisionKind lst:DecisionKind-park ; ls:decidesOn/ls:opportunityStatus lst:OpportunityStatus-parked`, 1],
  ])('has %s', (_label, pattern, expected) => {
    expect(count(pattern)).toBe(expected);
  });

  it('links all six safety cases to the one product', () => {
    expect(count(`?x a ls:SafetyCase ; ls:concerns d:P-101`)).toBe(6);
  });

  it('has exactly one serious adverse event that is verified and not yet reported (J1 starts here)', () => {
    expect(count(`?x ls:adverseEventSeriousness lst:AdverseEventSeriousness-serious ; ls:adverseEventEntry lst:AdverseEventEntry-verified ; ls:adverseEventReporting lst:AdverseEventReporting-notReported`)).toBe(1);
  });
});
