# Domain Spec: Life Sciences Thread

Version 0.21. November 20, 2026. Applies to: Ontology-Driven AI Platform Prompt Specification v0.26.

This spec applies the abstract platform pattern to three related life sciences domains. It defines the domains, their object types, the links between them, the personas, the journeys the platform must support and the regulatory obligations it must meet. It is the first domain applied under section 6 of the platform spec.

The platform spec stays domain-free. Everything domain-specific lives here.

---

## 1. The Thread

The three domains form one lifecycle: from molecule, to patient, to the real world, and back.

1. **Scientific Innovation.** A molecule is designed, tested in the lab and made in a controlled process.
2. **Clinical Development.** The molecule is tested on patients in a clinical trial. Its first work domain, **Design and Plan**, conceives, designs and simulates each study before anyone is enrolled (section 3.4).
3. **Safety and Regulatory.** What happens to patients is monitored, assessed and reported to regulators, during the trial and after launch.

What is learned in each domain flows back to the others. A safety signal sends scientists back to the molecule. A manufacturing deviation can explain an adverse event. The links between domains are the point of the platform.

### Terminology
Patient centricity rule: the platform never calls a person in a study a "subject". The object type is Patient. Where the study has no disease state, such as a healthy volunteer study, the interface labels the same object "participant". The label comes from the Study the person is enrolled in, not from separate code or a separate type.

### Reference grounding

Each domain is modeled on the scope of an existing Dassault Systèmes brand. The brands ground the model in real practice. The spec uses discipline names, not product names. Development and automated testing use the fictional seed graph in section 11. Real systems of record connect through adapters at the gateway (platform spec section 7).

| Domain | Modeled on | Core disciplines |
|---|---|---|
| Scientific Innovation | BIOVIA | Modeling and generative design, lab informatics (ELN), scientific data and registration, quality and manufacturing intelligence |
| Clinical Development | Medidata | Electronic data capture, data integration, trial management, patient experience (eConsent, eCOA, wearables) |
| Design and Plan | Medidata | Structured protocol authoring and digitization, trial simulation and forecasting from historical study data, study planning: budgets and site selection |
| Safety and Regulatory | ArisGlobal | Pharmacovigilance, regulatory information management, quality management (QMS, eTMF), medical affairs |

---

## 2. Domain: Scientific Innovation

Covers a molecule from design to manufactured batch.

### 2.1 Object types

| Type | What it is | State dimensions |
|---|---|---|
| Compound | A molecule under research | Stage: designed, synthesized, tested, candidate, retired. Registration: unregistered, registered. |
| Simulation | An in silico run predicting a compound's properties | Run: queued, running, complete, failed. Review: unreviewed, accepted, rejected. |
| Experiment | A lab experiment recorded in an electronic notebook | Record: planned, in progress, complete. Sign-off: unsigned, signed, witnessed. |
| Assay Result | A measured property from an experiment | Validity: valid, invalidated. |
| Formulation | A compound combined with other ingredients into a product | Stage: draft, under test, approved, obsolete. |
| Process | The approved way a formulation is manufactured | Status: draft, validated, superseded. |
| Batch | One manufactured lot of a formulation | Production: planned, in production, complete. Quality: pending, released, quarantined, rejected. Deviation risk: low, elevated, high. |

### 2.2 Relationships

- Simulation **predicts** Compound.
- Experiment **tests** Compound. Experiment **produces** Assay Result.
- Formulation **contains** Compound.
- Process **manufactures** Formulation. Batch **follows** Process.
- Compound **derived from** Compound (lineage of analogs).

### 2.3 Methods

| Method | On | Needs | Precondition | Effect |
|---|---|---|---|---|
| Run simulation | Compound | Model type | Compound is designed or later | Creates a Simulation in queued; the model then runs in the background. Refused until a model is connected (section 12) |
| Generate analogs | Compound | Target property | Compound has at least one accepted Simulation | Creates new Compounds in designed, linked by derived from. Refused until a generative chemistry model is connected (section 12) |
| Register | Compound | None | Compound is synthesized, unregistered | Registration: registered |
| Promote to candidate | Compound | Rationale | Stage is tested, has valid Assay Results | Stage: candidate |
| Sign experiment | Experiment | Signer | Record is complete | Sign-off: signed |
| Invalidate result | Assay Result | Reason | Result is valid | Validity: invalidated. Re-evaluates dependent promotions |
| Release batch | Batch | Reviewer | Production complete, quality pending, no open deviations | Quality: released |
| Quarantine batch | Batch | Reason | Quality is pending or released | Quality: quarantined |

---

## 3. Domain: Clinical Development

Covers a clinical trial from design to locked data.

### 3.1 Object types

| Type | What it is | State dimensions |
|---|---|---|
| Study | A clinical trial of one or more formulations, in patients or in people without the disease (for example, healthy volunteers) | Phase: I, II, III. Status: planned, enrolling, active, closed, locked. Blinding: blinded, unblinded. |
| Protocol | The plan a study is conducted under: its objectives, design, eligibility and schedule of assessments. Each version is its own protocol, with its version number, primary objective, planned enrollment and the date it came into force; an amendment is a new version that amends the one before it, with a summary of what it changes | Status: draft, in review, approved, superseded. |
| Site | A hospital or clinic running the study | Status: selected, activated, closed. Payment: current, overdue. |
| Patient | A person enrolled in a study. Labeled participant in studies without a disease state (see Terminology) | Enrollment: screened, consented, randomized, completed, withdrawn. Arm: unassigned, assigned. Arm visibility: hidden, revealed. The assigned arm itself is hidden while the study is blinded (rule 2). |
| Visit | A scheduled encounter with a patient. Has the date it is scheduled for, a deadline, and why it was missed if it was | Status: scheduled, completed, missed. |
| Data Record | A captured data point (lab value, vital sign, diary entry, device reading), with its value | Entry: entered, verified. Source: site, patient, device, health record. |
| Data Query | A question raised about a Data Record | Status: open, answered, closed. |
| Adverse Event | Something harmful that happened to a patient during the study, with the site's verbatim term | Entry: entered, verified. Seriousness: non-serious, serious. Outcome: ongoing, resolved. Reporting: not reported, reported to safety, reconciled. |

### 3.2 Relationships

- Study **tests** Formulation (cross-domain).
- Study **conducted under** Protocol: the version in force. Protocol **amends** Protocol: each amendment, the version before it.
- Study **runs at** Site. Patient **enrolled in** Study. Patient **enrolled at** Site.
- Patient **receives** Batch (cross-domain, via study drug supply).
- Visit **for** Patient. Data Record **captured at** Visit.
- Data Query **raised on** Data Record.
- Adverse Event **experienced by** Patient.

### 3.3 Methods

| Method | On | Needs | Precondition | Effect |
|---|---|---|---|---|
| Consent | Patient | eConsent record | Enrollment is screened | Enrollment: consented |
| Randomize | Patient | None | Enrollment is consented, study is enrolling | Enrollment: randomized. Arm: assigned |
| Complete visit | Visit | None | Status is scheduled | Status: completed |
| Record missed visit | Visit | Reason | Status is scheduled | Status: missed. Records the reason |
| Record data | Visit | Value, source | Status is completed | Creates a Data Record in entered, captured at the visit, with the value |
| Record adverse event | Patient | What happened, seriousness | Enrollment is randomized or later | Creates an Adverse Event in entered, ongoing, not reported, with the site's words as its verbatim term |
| Verify data record | Data Record | None | Entry is entered, and every query on it is closed | Entry: verified (source data verification; rule 4 then applies) |
| Verify adverse event | Adverse Event | None | Entry is entered | Entry: verified (source data verification) |
| Raise query | Data Record | Question | Entry is entered | Creates a Data Query in open |
| Answer query | Data Query | Answer | Status is open | Status: answered |
| Close query | Data Query | None | Status is answered | Status: closed |
| Re-query | Data Query | Why the answer does not resolve it | Status is answered | Status: open |
| Report to safety | Adverse Event | A note to safety, about this event | Not reported | Creates a Safety Case (cross-domain), with the note. Reporting: reported to safety |
| Reconcile adverse event | Adverse Event | None | Reported to safety, and a Safety Case originates from it | Reporting: reconciled. The person confirms the event and its case agree: seriousness, dates and outcome (SAE reconciliation) |
| Unblind patient | Patient | Justification | Study is blinded, arm is hidden, and rule 2 allows it | Arm visibility: revealed, for this patient only. Logged with its justification |
| Lock study | Study | None | Status closed, no open Data Queries | Status: locked |
| Send protocol for review | Protocol | None | Status is draft, and no concept's study scenario uses it (rule D1, section 3.7) | Status: in review |
| Approve protocol | Protocol | Electronic signature (approval) | Status is in review | Status: approved. The version it amends: superseded. Moves the studies the amended version governs to this version |
| Amend protocol | Protocol | What the amendment changes | Status is approved, and no amendment of it is in progress | Creates a Protocol in draft that amends this one, with the summary |

### 3.4 Design and Plan

Design and Plan is its own work domain: where a study is conceived, designed, planned and simulated before a single patient is enrolled. It is described inside Clinical Development because it hands its design to the study that runs it. Its object types, state dimensions and relationships are built (sections 3.5 and 3.6). Its methods are specified and not yet built (section 3.7). The model follows the design note *Authoring the Protocol as Structure* (October 31, 2026) and the product direction of November 20, 2026. Where those are silent, common industry practice fills the gap.

#### 3.4.1 Simulate the trial before it runs

An aircraft is flown in simulation long before it flies. A trial can be run the same way. A sponsor brings its study design, its budget and its plan for sites. Historical study data and models then predict how the trial will turn out before anyone is enrolled: when enrollment will finish, what it will cost, how much it will ask of patients and sites, what safety events to expect, and how likely it is to succeed. Each choice is tested in simulation while it is still cheap to change, not discovered in an amendment.

This rests on one condition: the design must be data. A protocol written only as prose cannot be simulated, so the protocol is authored as structure from the first word.

#### 3.4.2 Three spaces

| Space | What happens there | Where it lives |
|---|---|---|
| Protocol authoring | A protocol is brought in, either digitized from an existing document or written in the structured authoring tool. Either way it becomes the source of truth as structured objects that map to CDISC USDM and ICH M11. | Every Protocol, inside a study scenario or governing a study |
| Trial simulation | Parameters and assumptions are entered, and a study scenario is simulated many times to predict outcomes. | Every study scenario |
| Concept | Open exploration: a research opportunity or scientific question, with as many study scenarios as it needs. | Inside a program, across several programs, or outside any program |

**Protocol authoring.** Contributors work how they already work. A statistician writes directly in the structured protocol, a safety lead imports a Word file, a clinical scientist pastes from a Google Doc. Every path lands in the same structure. Imported content is a proposal until someone confirms how it maps to protocol objects. The medical writer stays accountable for the whole protocol, and their work moves from merging pieces to judging them. Data management, clinical operations and site-facing teams see the protocol from its first draft and comment on its objects while change is still cheap. When a version is approved, the EDC build, the schedule of activities, budgets and site plans draw on the same objects, so nothing is retyped.

**Trial simulation.** A trial simulation runs on a study scenario as it stood at one moment. The platform keeps every object's history (platform spec section 3.2), so the moment identifies exactly what was simulated. The simulation records its assumptions, such as recruitment rate, screen failure rate, dropout rate and the assumed treatment effect with its source. It runs thousands of virtual trials and produces forecasts: one per outcome measure, each a median with a range. Each forecast is measured against the outcome target for that measure, if one is set. Once the scenario changes, the forecasts are out of date, and a new simulation is needed for a fair comparison.

**Concept.** A concept is a research opportunity being explored: an indication, a design question or a scientific question. It can lead to one study, several or none, and a no is still a result worth keeping. A concept can sit inside a program, inform several programs, or sit outside any program, for example a question that would change how a whole class of studies is designed. A traditional study concept, the short proposal written for governance review, is one kind of Concept.

#### 3.4.3 The study scenario

A **study scenario** is one possible approach to a study. It is named apart from other uses of "scenario" across the company. It has three elements, which are worked on together because each moves the others:

1. **Protocol.** The structured study design.
2. **Study budget.** The cost of the scenario, or a ceiling set first as a constraint the design must meet.
3. **Site selection.** A list of proposed sites, each with its country, expected enrollment and start-up time.

Nothing inside a scenario has to come first. A team with a protocol in hand starts there; a team constrained by budget or by sites sets that first. Pulling one lever shows its effect on the other two. A narrower eligibility criterion shrinks the patient pool and the sites that can fill it. An added visit raises the cost per patient and the burden on patients and sites. A cheaper country mix may change the comparator, the visits or the labs.

A study scenario lives in a concept or in a study, never both. People build several scenarios, often by copying one and changing a single lever, then simulate each and compare their forecasts side by side. The best is selected. When a concept is pursued, its selected scenario is copied into the new study as the study's baseline, so the concept keeps its full history. A study can also run scenarios of its own, for example to test a change before an amendment.

The forecasts are what make a scenario comparable. Historical study data turn them from a calculation into advice. They hold real enrollment rates, startup times, amendment patterns and visit burden, so a simulation can flag the criterion or procedure that caused trouble in similar studies. That flag reaches the author as a **design signal** on the object that causes it. The author still decides, now with evidence.

#### 3.4.4 What a design must decide

The protocol objects carry these decisions, which follow ICH M11 and the CDISC Unified Study Definitions Model (USDM). The platform checks a design for gaps against them.

| Decision | What it settles | Objects | Practice it follows |
|---|---|---|---|
| Objectives and endpoints | Primary, secondary and exploratory questions, and the variable that answers each | Objective, Endpoint | ICH E8(R1), E9 |
| Estimands | For each primary objective, exactly what effect is estimated: treatment, population, variable, how intercurrent events (such as rescue medication or stopping treatment) are handled, and the population-level summary | Estimand | ICH E9(R1) |
| Population and eligibility | Who the study is for, as inclusion and exclusion criteria, each testable at screening | Population, Eligibility Criterion | ICH E8(R1), E17 |
| Arms and interventions | Investigational product, dose and regimen, comparator or placebo, background therapy, allocation | Arm, Intervention | ICH E10 |
| Visits and assessments | The visit schedule with its windows, and the procedures and measurements at each, with their burden and cost | Planned Visit, Assessment | ICH M11, USDM |
| Sample size and analysis | Power, effect size, dropout, the non-inferiority margin, multiplicity, interim analyses | Trial Simulation assumptions; the statistical analysis plan | ICH E9 |

The schedule of activities is a view of planned visits and their assessments, not an object of its own. The protocol document is a view too: one source with two faces, a readable document and a connected model.

Phase changes what dominates a design. Phase I studies are first-in-human, with single and multiple ascending doses, often in healthy volunteers (participants, by the Terminology rule), and a starting dose justified from nonclinical results. Phase II studies are proof of concept and dose-ranging in patients. Phase III studies are confirmatory: powered for the primary estimand, multi-regional, with a diversity action plan where one is required.

#### 3.4.5 Built for now, and what is left out

- **Protocol** is the existing type: the versioned, signed record. A protocol version being authored is a Protocol in draft. Its design objects are part of it.
- **Contributor and Comment are platform concerns, not domain types.** A contributor is a person with roles (platform spec section 3.3). Comments and design signals should share one annotation model attached to any object; the platform spec does not have one yet (section 12).
- **Trial Simulation is named apart from Simulation**, the in silico compound run in Scientific Innovation. **Design Signal is named apart from Signal**, the safety signal in section 4. **Planned Visit is named apart from Visit**, a patient's actual encounter, which is scheduled from it.
- **Sample size** is a trial simulation output (probability of success) and its assumptions, not a separate object.
- **Clinical supply, risk-based quality and feasibility surveys** are part of planning in practice but not part of a study scenario yet (section 12).

### 3.5 Design and Plan object types

| Type | What it is | State dimensions |
|---|---|---|
| Program | Groups research at the organizational level, such as the development of one candidate. Persists across concepts and studies | Status: active, on hold, discontinued. |
| Target Product Profile | The labeling a program aims for: indication, and its target and minimum efficacy and safety claims | Status: draft, endorsed, superseded. |
| Concept | A research opportunity being explored, with its rationale. Inside a program, across programs or outside any | Status: exploring, pursued, parked, not pursued. |
| Study Scenario | One possible approach to a concept or a study: a protocol, a study budget and a site selection, worked on together and simulated as one | Status: draft, selected, set aside. |
| Population | Who a study is for, defined by its eligibility criteria | None |
| Objective | A question a study asks | Level: primary, secondary, exploratory. |
| Estimand | The precise treatment effect an objective targets, with its five ICH E9(R1) attributes | Completeness: incomplete, complete. |
| Endpoint | How an objective is measured | Type: efficacy, safety, pharmacokinetic, patient-reported. |
| Eligibility Criterion | One inclusion or exclusion rule, with the data that tests it at screening | Kind: inclusion, exclusion. Testability: testable, needs data. |
| Arm | A planned treatment group, with its allocation | Role: experimental, active control, placebo control. |
| Intervention | A drug, device or comparator given in an arm, with its dose and regimen | None |
| Planned Visit | A point in the study timeline, with its study day and window. Each patient's Visit is scheduled from one | None |
| Assessment | A procedure or measurement, with its cost per visit and time on site | Purpose: endpoint, eligibility, safety, regulatory, none recorded. Burden: low, moderate, high. |
| Study Budget | The cost of a study scenario, in millions of US dollars, with its ceiling | Status: draft, approved. Fit: within ceiling, over ceiling. |
| Site Selection | The proposed sites of a study scenario | Status: draft, approved. |
| Proposed Site | A site proposed in a site selection, with its country, patients per month and days to activate | Status: proposed, shortlisted, rejected. |
| Trial Simulation | A simulation of a study scenario as it stood at one moment, run many times under stated assumptions | Run: queued, running, complete, failed. |
| Forecast | One predicted outcome of a trial simulation, as a median with a 10th to 90th percentile range | Currency: current, out of date. Measure: last patient in, probability of success, total cost, serious adverse events, patient burden, site burden. Against target: met, missed, no target. |
| Outcome Target | What success means for a concept or a study on one measure, as a threshold the forecast must be at most or at least | Status: proposed, agreed. Measure: last patient in, probability of success, total cost, serious adverse events, patient burden, site burden. |
| Contribution | Protocol content a contributor authored or imported, with where it came from | Mapping: proposed, confirmed. |
| Design Signal | What historical study data show about a design or plan object | Status: raised, acknowledged, dismissed. |
| Decision | A recorded choice on a concept or study: pursue, park or stop a concept, select a scenario, approve a baseline. With its rationale and date | Kind: pursue, park, stop, select scenario, approve baseline. |

### 3.6 Design and Plan relationships

- Concept **informs** Program or Study. Study **belongs to** Program. Program **aims at** Target Product Profile. Program **develops** Compound (cross-domain).
- Study Scenario **explores** Concept or Study: its one parent. Study Scenario **uses** one Protocol, one Study Budget and one Site Selection. Study **began from** Study Scenario: its baseline.
- Trial Simulation **simulates** Study Scenario. Forecast **comes from** Trial Simulation. Forecast **is measured against** Outcome Target. Outcome Target **sets success for** Concept or Study.
- Population, Objective, Arm and Planned Visit are **specified in** Protocol. Eligibility Criterion **defines** Population. Estimand **is the estimand of** Objective. Endpoint **measures** Objective. Endpoint **requires** Assessment. Assessment **performed at** Planned Visit. Intervention **given in** Arm. Intervention **administers** Formulation (cross-domain). Visit **scheduled from** Planned Visit.
- Proposed Site **proposed in** Site Selection. Proposed Site **proposes** Site.
- Contribution **contributes to** Protocol. Design Signal **is about** an Eligibility Criterion, Assessment, Planned Visit, Objective, Endpoint, Proposed Site or Study Budget. Decision **decides on** Concept or Study, and **chooses** a Study Scenario.
- Eligibility Criterion **justified by** Assay Result or Safety Case (cross-domain).

### 3.7 Design and Plan methods

**Specified, not yet built.** These are the skills that act on the objects above. The conformance tests read sections 3.1 to 3.6 and not this table. Several need the platform spec first (section 12): a deep copy for Copy study scenario and Pursue concept, and connected models for Import protocol and Run trial simulation. Until a model is connected, the gateway refuses those methods, as it refuses Run simulation.

| Method | On | Needs | Precondition | Effect |
|---|---|---|---|---|
| Create concept | Program | Name, rationale | None | Creates a Concept in exploring that informs the program |
| Start concept | Concept | Name, rationale | None | Creates a Concept in exploring outside any program (on demand) |
| Set outcome target | Concept | Measure, comparison, threshold, unit | Status is exploring | Creates an Outcome Target in proposed for the concept |
| Agree outcome target | Outcome Target | None | Status is proposed | Status: agreed |
| Create study scenario | Concept | Name | Status is exploring | Creates a Study Scenario in draft that explores it, with an empty draft protocol, study budget and site selection |
| Copy study scenario | Study Scenario | What the copy changes | Its parent is a concept in exploring, or a study | Creates a Study Scenario in draft with copies of its protocol, study budget and site selection |
| Import protocol | Protocol | A file or text | Status is draft | A connected model recognizes sections and proposes the objects in them, as a Contribution in proposed |
| Confirm mapping | Contribution | Corrections | Mapping is proposed | Mapping: confirmed. Creates or updates the protocol objects it maps to (rule D11) |
| Add objective | Protocol | Statement, level | Status is draft | Creates an Objective specified in the protocol |
| Define estimand | Objective | Treatment, population, variable, intercurrent events, summary | Level is primary | Creates the Estimand of the objective. Completeness: complete when all five are given |
| Add eligibility criterion | Population | Criterion, kind, tested by | Its protocol is draft | Creates an Eligibility Criterion that defines the population |
| Add assessment | Planned Visit | Name, purpose, cost per visit, time on site | Its protocol is draft | Creates an Assessment performed at the visit |
| Propose site | Site Selection | Site, country, patients per month, days to activate | Status is draft | Creates a Proposed Site in proposed |
| Set budget ceiling | Study Budget | Ceiling | Status is draft | Records the ceiling. Fit follows the latest forecast of total cost |
| Run trial simulation | Study Scenario | Assumptions: recruitment rate, screen failure rate, dropout rate, assumed effect, simulated trials | Status is draft or selected | Runs in the background on the scenario as it is now: creates a Trial Simulation and its Forecasts, measures each against its outcome target, and raises a Design Signal on each object history flags. The scenario's earlier forecasts: out of date |
| Compare study scenarios | Study Scenario | Other scenarios with the same parent | Each has a complete simulation with current forecasts | Shows their forecasts side by side, against the outcome targets (Compare and decide) |
| Select study scenario | Study Scenario | Rationale | Status is draft, with current forecasts | Status: selected. Records a Decision |
| Set aside study scenario | Study Scenario | Reason | Status is draft | Status: set aside |
| Acknowledge design signal | Design Signal | None | Status is raised | Status: acknowledged |
| Dismiss design signal | Design Signal | Why | Status is raised | Status: dismissed (rule D9) |
| Pursue concept | Concept | Study name | Status is exploring, and a study scenario is selected | Status: pursued. Creates a Study in planned, informed by the concept, that began from a copy of the selected scenario. Records a Decision |
| Park concept | Concept | Reason | Status is exploring | Status: parked. Records a Decision |
| Stop concept | Concept | Reason | Status is exploring or parked | Status: not pursued. Records a Decision |

**Rules for Design and Plan.** These become numbered rules in section 7 as their methods are built. One is built already: a protocol used by a concept's study scenario cannot be sent for review (D1, a precondition of Send protocol for review).

- **D1. Exploration stays with the concept.** A study scenario has one parent. A concept's protocols cannot be sent for review; pursuing the concept copies its selected scenario into the new study, so the concept's history never changes.
- **D2. Changes make forecasts out of date.** Any change to a scenario's protocol, budget or site selection after a simulation's moment makes its forecasts out of date. Compare and Select need current forecasts.
- **D3. Every assessment has a reason.** An assessment with no recorded purpose is flagged as burden without evidence, and needs a justification to stay.
- **D4. Estimands before review.** A protocol version cannot be sent for review until every primary objective has a complete estimand.
- **D5. Testable eligibility.** Each eligibility criterion names the data that tests it at screening.
- **D6. Traceable assumptions.** Each simulation assumption records its source.
- **D7. Starting dose from evidence.** A first-in-human protocol links its starting dose to the nonclinical results that justify it (NOAEL or MABEL).
- **D8. Budget ceiling.** When a forecast puts a scenario over its budget ceiling, the platform names the objects driving the gap.
- **D9. History advises, the author decides.** Design signals never block a method. Dismissing one records why.
- **D10. The medical writer is accountable.** A protocol version is sent for review by its medical writer, and its author cannot be its only approver (as rule 5).
- **D11. Imports are proposals.** Objects proposed from an imported protocol are drafts until a person confirms the mapping (as rule 6).

**Journeys for Design and Plan.** These run once their methods are built.

- **J4. From concept to study.** Clinical Scientist, with the Biostatistician, the Medical Writer and the Clinical Operations Lead. A Phase III concept is being explored under the program, with agreed targets for last patient in and probability of success. The scientist creates a study scenario and imports last year's synopsis, and the medical writer confirms the proposed objects. The biostatistician defines the primary estimand. The operations lead proposes sites and sets a budget ceiling. A trial simulation forecasts the last patient in at 23 months against a 20-month target, and the budget over its ceiling. It raises design signals on an exclusion criterion and on hand MRI. The scientist copies the scenario twice, changing one lever each time, and simulates both. Compare shows all three against the targets. The scientist selects one and pursues the concept, and the new study begins from that scenario.
- **J5. Testing an amendment before making it.** Clinical Operations Lead, then Clinical Scientist. A running study creates a scenario that uses its draft amendment and simulates it against the baseline. The scientist selects it, and the amendment goes for review.
- **J6. From a confirmed safety signal to a design change.** Continues J2. A confirmed Signal reaches the study's design through Formulation and Intervention. The scientist adds liver function tests in a study scenario, simulates the added burden and cost, and amends the protocol.

**Regulatory obligations for Design and Plan.**

| Obligation | What the platform must do |
|---|---|
| Quality by design (ICH E8(R1)) | Record the critical-to-quality factors of each design |
| Statistical principles and estimands (ICH E9, E9(R1)) | Hold estimands as structured objects, and trace simulation assumptions to their sources |
| Choice of control group (ICH E10) | Record each control arm and its justification |
| Good clinical practice (ICH E6(R3)) | Risk-proportionate design, with every design decision logged with who made it and why |
| Structured protocol (ICH M11; CDISC USDM) | Export a protocol version as an M11 protocol and as USDM data |
| Multi-regional trials (ICH E17) | Record regional enrollment and consistency assumptions |
| Diversity action plans (FDA, under FDORA 2022) | Record enrollment goals by demographic group where a plan is required |
| Models used for decisions | Each simulation model is validated for its intended use, and every forecast records the model and data it came from (platform spec section 7) |

---

## 4. Domain: Safety and Regulatory

Covers patient safety and regulatory obligations, during trials and after launch.

### 4.1 Object types

| Type | What it is | State dimensions |
|---|---|---|
| Safety Case | One report of an adverse reaction in one patient. Has a date of receipt, one or more coded reactions, and a narrative once one is accepted | Workflow: received, triaged, assessed, reported, closed. Seriousness: non-serious, serious. Expectedness: expected, unexpected. Causality: unassessed, unrelated, possible, probable. |
| Product | A marketed or investigational product | Status: investigational, approved, withdrawn. |
| Signal | A possible new risk detected across many cases: one reaction, for one product | Status: detected, under evaluation, confirmed, refuted. |
| Submission | A regulatory filing to an authority. Records who prepared it and its due date | Status: draft, in review, submitted, acknowledged. Deadline: on track, due soon, overdue. |
| Quality Event | A deviation, complaint or audit finding | Status: open, investigating, CAPA assigned, closed. Severity: minor, major, critical. |
| CAPA | A corrective and preventive action | Status: planned, in progress, effective, ineffective. |
| Medical Inquiry | A question from a clinician or patient about a product | Status: received, answered, closed. |

### 4.2 Relationships

- Safety Case **originates from** Adverse Event (cross-domain) or **originates from** Medical Inquiry.
- Safety Case **concerns** Product. Product **is** Formulation (cross-domain).
- Safety Case **may involve** Batch (cross-domain).
- Signal **aggregates** Safety Case. Signal **concerns** Product.
- Submission **reports** Safety Case or Signal.
- Quality Event **raised on** Batch (cross-domain). CAPA **resolves** Quality Event.
- Safety Case **duplicate of** Safety Case.

### 4.3 Methods

| Method | On | Needs | Precondition | Effect |
|---|---|---|---|---|
| Triage | Safety Case | Seriousness, expectedness | Workflow is received | Workflow: triaged. Sets seriousness and expectedness |
| Flag duplicate | Safety Case | Candidate case | Neither case is closed | Links the two by duplicate of. A suggestion until a human confirms (rule 6) |
| Assess | Safety Case | Causality | Workflow is triaged | Workflow: assessed |
| Generate narrative | Safety Case | None | Workflow is triaged or later | A connected model drafts the case narrative from the case, the event or inquiry it originates from, its product and any batch it may involve, as far as the person may read them. Accepting the draft, as written or edited, sets the case's narrative (rule 6) |
| Merge duplicate | Safety Case | Target case | Cases are linked by duplicate of | Merges into target. Source workflow: closed |
| Prepare expedited report | Safety Case | None | Assessed, serious, unexpected, possible or probable, and no submission reports it yet | Creates a Submission in draft, prepared by the person, due 15 days after the case was received (rule 1) |
| Close case | Safety Case | None | Workflow is reported, or assessed and no expedited report is required | Workflow: closed |
| Send for review | Submission | Reviewer | Status is draft | Status: in review |
| Submit | Submission | Approver | Status is in review | Status: submitted. Each Safety Case it reports moves to Workflow: reported |
| Run signal detection | Product | None | Product has Safety Cases | Runs in the background: a disproportionality analysis of the product's cases by reaction (rule 7). Creates a Signal in detected, concerning the product, for the reaction and aggregating its cases, for each reaction that meets rule 7 and has no Signal on the product yet |
| Evaluate signal | Signal | None | Status is detected | Status: under evaluation |
| Confirm signal | Signal | Rationale | Under evaluation | Status: confirmed. Suggests follow-up in other domains |
| Refute signal | Signal | Rationale | Under evaluation | Status: refuted |
| Open quality event | Batch | Description, severity | None | Creates a Quality Event in open |
| Start investigation | Quality Event | Investigator | Status is open | Status: investigating |
| Assign CAPA | Quality Event | Owner, action | Status is investigating | Creates a CAPA in planned. Status: CAPA assigned |
| Start CAPA | CAPA | None | Status is planned | Status: in progress |
| Record CAPA outcome | CAPA | Outcome, evidence | Status is in progress | Status: effective or ineffective. If ineffective, its Quality Event returns to investigating |
| Close quality event | Quality Event | None | Status is CAPA assigned and its CAPA is effective | Status: closed |


---

## 5. Cross-Domain Links

These links are the main proof that domains connect through the graph, not through special code.

| Link | From | To | Why it matters |
|---|---|---|---|
| tests | Study | Formulation | A trial is anchored to what the lab designed |
| receives | Patient | Batch | A patient can be traced to the exact lot they took |
| originates from | Safety Case | Adverse Event | A trial adverse event becomes a safety case without re-entry |
| is | Product | Formulation | The safety view and the lab view are the same thing |
| may involve | Safety Case | Batch | A safety problem can be traced to manufacturing |
| raised on | Quality Event | Batch | Quality and manufacturing share one record of a lot |
| develops | Program | Compound | A program is anchored to the candidate it develops |
| administers | Intervention | Formulation | Each arm of a design traces to what was designed and made |
| justified by | Eligibility Criterion | Assay Result or Safety Case | Why a criterion exists is in the graph, not in someone's memory |

A confirmed Signal on a Product also reaches back into design: through its Formulation to the Interventions that administer it, then to their Arms, Protocols and Studies (journey J6).

Confirming a Signal on a Product lets agents traverse back to the Formulation, its Compound and its Batches. Nothing in the code knows this path. It exists because the links exist.

---

## 6. Personas

These are the domain's canonical roles (platform spec section 3.3). Each Can and Cannot column is the role's default permissions: a starting point each organization may vary. A person may hold several of these roles. The Works mainly in column sets the role's work domains, which decide its navigation (platform spec section 5.1).

| Persona | Works mainly in | Goal | Can | Cannot |
|---|---|---|---|---|
| Computational Chemist | Scientific Innovation | Find a better compound | Run simulations, generate analogs, register and promote compounds | See patient-level clinical data |
| Clinical Research Coordinator | Clinical Development | Run the study well at their site | Consent and randomize patients, complete visits or record them as missed, record data and adverse events, answer queries | Verify data. Close queries. See unblinded arms |
| Clinical Research Associate | Clinical Development | Make sure site data match their sources | Verify data records and adverse events against source documents, raise queries | Enter or change site data. Answer queries. See unblinded arms |
| Clinical Data Manager | Clinical Development | Get clean data to study lock | Raise, close and re-query queries, report adverse events to safety and reconcile them with their safety cases, lock studies, and send, approve and amend protocol versions | See unblinded arms. Change safety assessments |
| Drug Safety Physician | Safety and Regulatory | Protect patients and meet reporting deadlines | Triage, assess, flag and merge cases, run detection and evaluate, confirm and refute signals, request unblinding, prepare submissions and approve those they did not prepare | Change clinical data. Release batches |
| Clinical Scientist | Design and Plan and Clinical Development | A design that answers the right question for the program | Explore concepts and study scenarios, shape objectives, criteria and assessments, amend protocol versions | See unblinded arms |
| Biostatistician | Design and Plan and Clinical Development | A design that answers its question reliably and efficiently | Define estimands and the assumptions of trial simulations | See unblinded arms |
| Medical Writer | Design and Plan and Clinical Development | One coherent, approvable protocol | Confirm contributions, write the narrative, send protocol versions for review | See unblinded arms |
| Clinical Operations Lead | Design and Plan and Clinical Development | A plan that delivers on time and on budget | Build study budgets and site selections, run and compare trial simulations | See unblinded arms |
| Quality Lead | Scientific Innovation and Safety and Regulatory | Keep every batch compliant | Release and quarantine batches, open, investigate and close quality events, assign CAPAs and record their outcomes | Assess safety cases |

The four Design and Plan personas run only the protocol methods named for them until the methods of section 3.7 are built; they read and navigate the design and plan graph now.

An external agent, such as a contract research organization's, may answer and close Data Queries at its own sites (see External agent in section 10).

The same object must look different to each persona. A Batch is a production record to the Quality Lead, a supply item to the Clinical Data Manager and a possible cause to the Drug Safety Physician. The platform must explain why each persona sees what it sees.

---

### To do

These make To do work for this domain (platform spec section 5.1).

- **On-demand methods**, which a person chooses to run rather than work waiting: Amend protocol, Run simulation, Generate analogs, Invalidate result, Quarantine batch, Open quality event, Record data, Record adverse event, Raise query, Unblind patient, Flag duplicate, Generate narrative, Run signal detection.
- **Urgent values:** high deviation risk (high), elevated deviation risk (medium), a serious adverse event or case (high), a critical quality event (high), a major quality event (medium), a submission due soon (high) or overdue (highest).
- **Deadlines:** a submission's due date, and the date a visit is scheduled for.

### Interaction archetypes

Each method's interaction archetype, derived by the rules in platform spec section 5.4. No method overrides its rule. Run simulation and Run signal detection are marked as running in the background.

| Method | On | Archetype |
|---|---|---|
| Sign experiment | Experiment | Review and sign |
| Submit | Submission | Review and sign |
| Approve protocol | Protocol | Review and sign |
| Run signal detection | Product | Start and track |
| Run simulation | Compound | Start and track |
| Flag duplicate | Safety Case | Compare and decide |
| Merge duplicate | Safety Case | Compare and decide |
| Generate analogs | Compound | Review a draft |
| Generate narrative | Safety Case | Review a draft |
| Answer query | Data Query | Fill in |
| Re-query | Data Query | Fill in |
| Record adverse event | Patient | Fill in |
| Record data | Visit | Fill in |
| Record missed visit | Visit | Fill in |
| Assess | Safety Case | Fill in |
| Assign CAPA | Quality Event | Fill in |
| Confirm signal | Signal | Fill in |
| Consent | Patient | Fill in |
| Invalidate result | Assay Result | Fill in |
| Open quality event | Batch | Fill in |
| Promote to candidate | Compound | Fill in |
| Quarantine batch | Batch | Fill in |
| Raise query | Data Record | Fill in |
| Record CAPA outcome | CAPA | Fill in |
| Refute signal | Signal | Fill in |
| Release batch | Batch | Fill in |
| Report to safety | Adverse Event | Fill in |
| Send for review | Submission | Fill in |
| Start investigation | Quality Event | Fill in |
| Triage | Safety Case | Fill in |
| Unblind patient | Patient | Fill in |
| Close case | Safety Case | Confirm |
| Close quality event | Quality Event | Confirm |
| Close query | Data Query | Confirm |
| Complete visit | Visit | Confirm |
| Reconcile adverse event | Adverse Event | Confirm |
| Verify adverse event | Adverse Event | Confirm |
| Verify data record | Data Record | Confirm |
| Evaluate signal | Signal | Confirm |
| Send protocol for review | Protocol | Confirm |
| Amend protocol | Protocol | Fill in |
| Lock study | Study | Confirm |
| Prepare expedited report | Safety Case | Confirm |
| Randomize | Patient | Confirm |
| Register | Compound | Confirm |
| Start CAPA | CAPA | Confirm |

No method in this domain needs Choose an object or Step by step yet.

**Run for many objects.** Free text and links describe one object, so every such input is marked as about each object (platform spec 5.4) and a batch of its method runs one after another: a note to safety, a reason, a justification, a question, an answer or a summary is given for each object in turn. The exceptions are a simulation's model type and analogs' target property, settings that hold for every compound. Choices, such as seriousness or causality, and people are shared, so Triage or Assess runs together. Reporting two adverse events to safety therefore goes through each event in turn for its note.

The two signed methods carry these meanings (platform spec section 3.4, Electronic signatures):

| Method | Meaning of the signature |
|---|---|
| Sign experiment | Authorship: I performed this experiment, and its record is complete and accurate. |
| Submit | Approval: I approve this report for submission to the regulatory authority. |

---

## 7. Business Context

Rules the Guard agent enforces. They are data in the business context, not code.

1. **Expedited reporting.** A serious, unexpected case with possible or probable causality must be submitted within 15 days of receipt. Within 3 days of the deadline, its Submission is due soon.
2. **Blinding.** While a study is blinded, no persona sees a patient's arm. A Drug Safety Physician may unblind one patient only when that patient's Safety Case is triaged as serious and unexpected, so the arm is needed to assess causality for a possible expedited report. Every unblinding is logged with its justification.
3. **Batch release.** A batch with an open Quality Event cannot be released.
4. **Data integrity.** Signed experiments and verified data records cannot be edited. They can only be corrected by a new linked record.
5. **Separation of duties.** The person who prepares a Submission cannot approve it.
6. **Human review.** Generated narratives and generated analogs are drafts until a human accepts them.
7. **Signal detection.** For a product and a reaction, count the cases: those of the product with the reaction (a), the product's other cases (b), other products' cases with the reaction (c), and other products' other cases (d). A case flagged as a duplicate of another is not counted. The pair is a signal when all three hold (the criteria of Evans, Waller and Davis, 2001):
   - at least 3 cases, a ≥ 3;
   - a proportional reporting ratio of at least 2, where PRR = (a / (a + b)) / (c / (c + d)); when no other product's case has the reaction, the ratio is unbounded and meets this;
   - a chi-squared statistic with Yates' correction of at least 4, where χ² = N (|ad − bc| − N/2)² / ((a + b)(c + d)(a + c)(b + d)) and N = a + b + c + d.

   The three thresholds are parameters of the rule. With no other product's cases to compare with, the analysis cannot run, and the run fails with that reason.

---

## 8. Regulatory Obligations

The platform is a regulated system in these domains. These obligations apply on top of platform spec section 7.

| Obligation | What the platform must do |
|---|---|
| Electronic records and signatures (21 CFR Part 11, EU GMP Annex 11) | Audit trails on every regulated record. Signatures bound to their record with the signer, time and meaning. Controlled access |
| Data integrity (ALCOA+) | Records are attributable, legible, contemporaneous, original, accurate, complete, consistent, enduring and available |
| Computerized system validation (GxP) | The configuration (ontology, methods, policies, catalog) is validated for its intended use, and changes to it go through change control |
| Good clinical practice (ICH E6) | Blinding and trial integrity are protected. Every clinical data point traces to its source |
| Safety reporting (ICH E2B(R3)) | Expedited reports are produced as E2B(R3) individual case safety reports |
| Patient privacy (HIPAA, GDPR) | Patients are pseudonymized outside the clinical domain. Direct identifiers are visible only to roles that need them |

---

## 9. Ontology

The domain is written in the platform's ontology format (platform spec section 3.1), in `ontology/life-sciences/`.

| File | Holds |
|---|---|
| `model.ttl` | Object types, state dimensions, relationships and their shapes |
| `terms.ttl` | The value of every state dimension, as SKOS concepts with NCIt mappings |
| `methods.ttl` | Methods, their inputs, preconditions and effects |
| `rules.ttl` | The business rules in section 7, with their parameters |
| `roles.ttl` | The personas in section 6, with the methods they may run and what they may not read |

- **Namespace.** `https://w3id.org/lsh-platform/life-sciences#`, with concepts under `…/life-sciences/term#` and shapes under `…/life-sciences/shape#` (platform spec section 3.1). Example and seed data use `https://example.org/`, which is reserved for examples, so it can never be mistaken for real records.
- **Titles.** Each type titles its objects from a template (platform spec section 3.1, Title). The first alternative whose values are all present is used:

  | Type | Title | Example |
  |---|---|---|
  | Compound | Its name, or "Analog of" its parent | LSH-4471, JAK1 inhibitor |
  | Simulation | Model type, prediction for the compound | ADMET prediction for LSH-4471, JAK1 inhibitor |
  | Experiment | Aim, compound | Kinase selectivity panel, LSH-4471, JAK1 inhibitor |
  | Assay Result | The result | JAK1 IC50 4.2 nM |
  | Formulation | Its name | Velcorin 25 mg film-coated tablet |
  | Process | Manufacturing process for the formulation | Manufacturing process for Velcorin 25 mg film-coated tablet |
  | Batch | Lot number | Lot VL25-2410-02 |
  | Study | Short name and title | VELOCITY-2: Velcorin in moderate to severe rheumatoid arthritis |
  | Protocol | Name and version, or "Amendment to" the version it amends | VELOCITY-2 protocol, version 2.0 |
  | Site | Its name | Northfield General Hospital |
  | Patient | Patient at the site, never a name | Patient at St. Brendan's University Hospital |
  | Visit | Visit name for the patient's identifier | Week 12 visit for PT-03 |
  | Data Record | The value | Heart rate 72 bpm |
  | Data Query | The question | Units missing for this value; please confirm against the source |
  | Adverse Event | The verbatim term | Fever and cough; admitted to hospital with pneumonia |
  | Safety Case | Reactions with the product, or "Case from" its source | Skin rash, nausea with Velcorin 25 mg tablets |
  | Product | Its name | Velcorin 25 mg tablets |
  | Signal | Reaction with the product | Drug-induced liver injury with Velcorin 25 mg tablets |
  | Submission | Expedited report for the case | Expedited report for SC-003 |
  | Quality Event | Its description | Tablet hardness below specification in lot VL25-2410-02 |
  | CAPA | Its action | (none in the seed) |
  | Medical Inquiry | The question | Rash and nausea in the first week of Velcorin: report or wait? |
  | Program | Its name | Velcorin in immune-mediated inflammatory disease |
  | Target Product Profile | "Target product profile:" and its indication | Target product profile: moderate to severe rheumatoid arthritis |
  | Concept | Its name | Phase III of Velcorin in moderate to severe rheumatoid arthritis |
  | Study Scenario | Its name | VELOCITY-3 baseline: 640 patients, 9 countries |
  | Population | Its description | Adults with moderate to severe rheumatoid arthritis and an inadequate response to methotrexate |
  | Objective, Endpoint, Eligibility Criterion | Its statement | ACR20 response at Week 24 |
  | Estimand | "Estimand:" and its variable | Estimand: ACR20 response at Week 24 |
  | Arm, Intervention, Planned Visit, Assessment | Its name | Week 12 |
  | Study Budget, Site Selection | Its name | VELOCITY-3 baseline budget |
  | Proposed Site | The site it proposes, or "Proposed site in" its country | Northfield General Hospital |
  | Trial Simulation | "Simulation of" its scenario | Simulation of VELOCITY-3 baseline: 640 patients, 9 countries |
  | Forecast | Measure, median and unit | Last patient in: 23 months |
  | Outcome Target | Measure, comparison, threshold and unit | Last patient in at most 20 months |
  | Contribution | Its name | Safety monitoring section, imported from Word |
  | Design Signal | What history shows | Hand MRI at three visits served no endpoint, and studies like it took about 2 months longer to activate sites |
  | Decision | Its rationale | Parked until VELOCITY-3 is designed, so the program does not run two Phase III studies at once |

  Methods that create objects record what the person typed where a title needs it: the model type, the query's question, the quality event's description and the CAPA's action.
- **Relationships.** Each relationship reads both ways, as verb phrases that complete "this object ... these objects", says which end is part of the other, and, where the domain is certain, says that an object links to at most one object along it (platform spec section 3.1). From these, every object's panel takes its tabs: a study's Sites and Patients, a patient's Visits and Adverse Events, a data record's Data Queries (platform spec section 5.1, Within an object).

  | Relationship | From → To | Reads back as | Containment | At most |
  |---|---|---|---|---|
  | predicts | Simulation → Compound | is predicted by | Related only | one compound |
  | tests | Experiment → Compound; Study → Formulation | is tested in | Related only | Many |
  | produces | Experiment → Assay Result | is produced by | The assay result is part of the experiment | Many |
  | contains | Formulation → Compound | is contained in | Related only | Many |
  | manufactures | Process → Formulation | is manufactured by | Related only | one formulation |
  | follows | Batch → Process | is followed by | Related only | one process |
  | derived from | Compound → Compound | is the source of | Related only | one parent |
  | runs at | Study → Site | hosts | Related only | Many |
  | conducted under | Study → Protocol | governs | Related only | one protocol |
  | amends | Protocol → Protocol | is amended by | Related only | one version |
  | enrolled in | Patient → Study | enrolls | The patient is part of the study | one study |
  | enrolled at | Patient → Site | enrolls | Related only | one site |
  | receives | Patient → Batch | is received by | Related only | Many |
  | for | Visit → Patient | has | The visit is part of the patient's record | one patient |
  | captured at | Data Record → Visit | captures | The data record is part of the visit | one visit |
  | raised on | Data Query → Data Record; Quality Event → Batch | has | The query is part of the data record; the quality event is part of the batch's record | one data record; one batch |
  | experienced by | Adverse Event → Patient | experienced | The adverse event is part of the patient's record | one patient |
  | originates from | Safety Case → Adverse Event or Medical Inquiry | is the source of | Related only | one source |
  | concerns | Safety Case → Product; Signal → Product | is named in | Related only | one product, for a signal |
  | is | Product → Formulation | is marketed as | Related only | one formulation |
  | may involve | Safety Case → Batch | may be involved in | Related only | Many |
  | aggregates | Signal → Safety Case | is aggregated in | Related only | Many |
  | reports | Submission → Safety Case or Signal | is reported in | Related only | Many |
  | resolves | CAPA → Quality Event | is resolved by | The CAPA is part of the quality event | one quality event |
  | duplicate of | Safety Case → Safety Case | is duplicated by | Related only | one case |
  | informs | Concept → Program or Study | is informed by | Related only | Many |
  | belongs to | Study → Program | includes | Related only | one program |
  | aims at | Program → Target Product Profile | is the aim of | Related only | Many |
  | develops | Program → Compound | is developed in | Related only | Many |
  | explores | Study Scenario → Concept or Study | is explored by | The scenario is part of its concept or study | one parent |
  | uses | Study Scenario → Protocol; Study Budget; Site Selection | is used in | Related only | one of each |
  | began from | Study → Study Scenario | seeded | Related only | one scenario |
  | simulates | Trial Simulation → Study Scenario | is simulated by | The simulation is part of its scenario | one scenario |
  | comes from | Forecast → Trial Simulation | forecasts | The forecast is part of its simulation | one simulation |
  | is measured against | Forecast → Outcome Target | measures | Related only | one target |
  | sets success for | Outcome Target → Concept or Study | has targets | The target is part of its concept or study | one parent |
  | specified in | Population, Objective, Arm, Planned Visit → Protocol | specifies | Part of the protocol version | one protocol |
  | defines | Eligibility Criterion → Population | is defined by | The criterion is part of the population | one population |
  | is the estimand of | Estimand → Objective | targets | The estimand is part of the objective | one objective |
  | measures | Endpoint → Objective | is measured by | Related only | one objective |
  | requires | Endpoint → Assessment | produces data for | Related only | Many |
  | given in | Intervention → Arm | gives | Related only | Many |
  | administers | Intervention → Formulation | is administered as | Related only | one formulation |
  | performed at | Assessment → Planned Visit | performs | Related only | Many |
  | scheduled from | Visit → Planned Visit | schedules | Related only | one planned visit |
  | proposed in | Proposed Site → Site Selection | proposes | The proposed site is part of the selection | one selection |
  | proposes | Proposed Site → Site | is proposed as | Related only | one site |
  | contributes to | Contribution → Protocol | has contributions | Related only | one protocol |
  | is about | Design Signal → a design or plan object | has design signals | Related only | one object |
  | decides on | Decision → Concept or Study | is decided by | The decision is part of its concept or study | one parent |
  | chooses | Decision → Study Scenario | is chosen by | Related only | one scenario |
  | justified by | Eligibility Criterion → Assay Result or Safety Case | justifies | Related only | Many |

- **Drafting instructions.** The instructions a model follows to draft a case narrative are in `methods.ttl`, with the method. They ask for an ICH E2B(R3) case narrative built only from the records given, with what is not recorded said plainly, the patient never called a subject, and identifiers instead of names.
- **Reactions.** A case's reactions, and a signal's reaction, are SKOS concepts mapped to NCIt. They stand in for MedDRA preferred terms, the standard for coding reactions, until MedDRA is licensed.
- **Terminologies.** NCIt first, because it is free. Every NCIt mapping was checked against the NCI Thesaurus service; the Design and Plan mappings (Population, Estimand, Arm and its roles, Endpoint, Intervention, Planned Visit, Eligibility Criterion and its kinds, objective levels and patient-reported endpoints) on November 20, 2026. Concept, Study Scenario, Trial Simulation, Forecast and the planning types have no NCIt match and are minted here. CDISC USDM mappings follow with protocol export. MedDRA and WHODrug follow once licensed.
- **Tests** keep the ontology and this spec in step: every object type, state value and method in sections 2 to 4, and every Design and Plan object type and state value in section 3.5, must exist in the ontology, and the journeys' preconditions are tested against small example graphs.

---

## 10. Journeys

Each journey runs the full core loop (platform spec section 4).

### J1. From trial adverse event to expedited report
**Persona:** Clinical Data Manager, then Drug Safety Physician.

1. **Orient.** The Clinical Data Manager sees the study with open queries and a new serious adverse event surfaced as a starting point.
2. **Find.** They open the adverse event.
3. **Choose.** Report to safety is offered. Changing the event's details is not, because the record is verified (rule 4).
4. **Declare.** "Send this to safety."
5. **Compose.** A view confirms the patient, event and seriousness, and previews the Safety Case that will be created.
6. **Commit.** The Safety Case is created in received, linked to the Adverse Event. The change is logged.
7. **Continue.** The Drug Safety Physician now sees the case at the top of their queue, ranked by its reporting deadline. They triage, assess and prepare the expedited report.

### J2. From safety signal back to the molecule
**Persona:** Drug Safety Physician, then Computational Chemist.

1. **Orient.** The physician sees a detected Signal on a Product.
2. **Find.** "Show me the cases behind this signal."
3. **Choose.** Evaluate signal is offered.
4. **Declare.** "I think this is real. Confirm it and tell the research team."
5. **Compose.** The view lists the aggregated cases, their causality and a draft rationale for review.
6. **Commit.** The Signal is confirmed.
7. **Continue.** The platform traverses Product to Formulation to Compound and suggests follow-up to the Computational Chemist: generate analogs that keep efficacy and lower the risky property.

### J3. From manufacturing deviation to quarantine
**Persona:** Quality Lead.

1. **Orient.** A Batch shows deviation risk high, surfaced from production analytics.
2. **Find.** The Quality Lead opens the Batch.
3. **Choose.** Release batch is not offered, because a Quality Event is open. Quarantine and Open quality event are offered.
4. **Declare.** "Hold this lot and find out who is affected."
5. **Compose.** A view previews the quarantine and lists every patient who received the batch and every Safety Case that may involve it.
6. **Commit.** The Batch is quarantined. The open Quality Event moves to investigating and a CAPA is assigned.
7. **Continue.** The platform suggests the Drug Safety Physician review the linked cases.

### Edge case: unblinding inside J1
In J1, the Drug Safety Physician needs the patient's arm to assess causality. The study is blinded.

No code handles this case. The Act agent sees Unblind patient is gated by policy. The Guard agent reads rule 2 in section 7, checks that the Safety Case is triaged as serious and unexpected, and allows the unblinding for this patient only. The physician then assesses causality and prepares the expedited report. If the event were non-serious, the Guard would block it and explain which condition failed. The Clinical Data Manager still cannot see the arm.

A second candidate edge case: the same adverse event arrives twice, once from the trial and once as a medical inquiry. The Find agent proposes Flag duplicate by similarity. The physician confirms the link, then merges.

### Inspection
In any journey, any persona can ask "why am I seeing this?" on any view or element. The platform shows the `because` of each view node, the graph object it binds to, the method and its precondition, and the business rule that allowed or blocked it. This satisfies the inspection requirement in section 6 of the platform spec.

### External agent
A contract research organization's agent connects through the gateway with no UI. It lists open Data Queries at its sites, answers them from its own records and closes the ones it can. Everything it does is checked by the same policy and appears in the same log as a human's actions.

---

## 11. Seed Graph

Small and fictional. Used for development and automated testing, and enough to run every journey. It is never mixed with real records.

- One research program with 5 compounds, including 1 candidate and 2 analogs.
- 1 formulation of the candidate, 1 validated process and 3 batches. One batch has high deviation risk.
- 1 blinded Phase II study, enrolling, at 3 sites with 12 patients and 2 arms: 10 randomized, 1 consented, 1 screened.
- The study's protocol in three versions: 1.0 superseded, 2.0 approved and in force, and 3.0, a draft amendment that adds a Week 16 safety visit and waits to be sent for review.
- 30 visits: 2 completed for each randomized patient, and a third scheduled around November 12, 2026, two of them overdue.
- 40 data records: 14 entered and awaiting source data verification, the rest verified. 8 queries: 3 open, 3 answered, 2 closed.
- 5 adverse events: 2 reported to safety and awaiting reconciliation, 1 serious and not yet reported (J1), and 2 new from the site awaiting verification, one of them serious.
- 6 safety cases, including 1 duplicate pair, linked to 1 investigational product, each coded with its reactions.
- 1 approved product, the comparator for signal detection, with 20 closed historical cases. All are post-market reports, so they originate from neither a trial nor an inquiry in the seed.
- 1 detected signal aggregating 3 cases.
- 1 open quality event and 1 submission in draft.
- Eight people, one for each persona of the three domains, plus a second Drug Safety Physician so a submission can be approved by someone other than its preparer (rule 5).
- One external agent, a contract research organization's, for the External agent journey.
- **Design and Plan.** One active program for the candidate, with an endorsed target product profile; the Phase II study belongs to it. Three concepts: a Phase III concept being explored in the program, a parked concept with its decision, and a concept outside any program, on liver monitoring across the class.
- The Phase III concept has three outcome targets (last patient in, probability of success, total cost) and three study scenarios: a baseline and two copies, each changing one lever. Each uses a draft protocol, a study budget and a site selection; two budgets are over their ceiling. Seven proposed sites, two of them at new sites in Poland and Brazil.
- The baseline protocol is structured: a population with 7 eligibility criteria (one not yet testable), 3 objectives with a complete estimand for the primary, 4 endpoints, 2 arms with their interventions, 6 planned visits and 6 assessments, one with no recorded purpose. Two contributions, one awaiting confirmation. The two variant protocols record only what they change; their structure is copied once Copy study scenario is built.
- Three trial simulations: two complete with 7 forecasts, 4 of which miss their target, and one queued. Two design signals raised, on an exclusion criterion and on hand MRI.
- The Phase II study runs one study scenario of its own, using its draft amendment (J5).
- Four more people, one for each Design and Plan persona.

All names, compounds, products, sites, lots, studies and people are invented. Product names, such as Velcorin and Duxalate, belong to no real medicine.

The seed graph is `data/life-sciences/seed.ttl`, under `https://example.org/lsh-data/`. It starts each journey at its first step:

| Journey | Starts with |
|---|---|
| J1 | The serious, unexpected adverse event, verified and not yet reported to safety |
| J2 | The detected signal on the investigational product, aggregating three cases |
| J3 | The batch with high deviation risk, complete, pending quality, with the open quality event raised on it |
| Duplicate edge case | Two cases for the same event, one from the trial and one from a medical inquiry |
| Signal detection | Run signal detection on the investigational product finds one new signal, for skin rash, in 4 cases. Drug-induced liver injury already has SIG-1, so it is not detected again |

Patients, visits, data records, adverse events, safety cases and medical inquiries hold personal health data. The ontology marks them, and the gateway records every read of them. No property in this ontology identifies a person directly: patients are known by study codes, such as PT-03, and staff by their names as users of the platform. So nothing is marked `p:identifiesPerson` yet; free text, such as a reporter's note or a medical inquiry, may still name someone (platform spec section 9).

---

## 12. Open Questions

- Should a fourth persona represent the regulator, consuming Submissions through the gateway?
- Should post-market cases (after approval) be in scope, or only trial cases?
- Which models back Run simulation and Generate analogs, and how are they validated for their intended use? Until one is connected, the gateway refuses both. Generate narrative is drafted by Claude Opus 5.5 where a deployment connects it.
- Should signal detection move from PRR to a Bayesian method, such as the empirical Bayes geometric mean or the information component, once the case volume supports it?
- When a later run finds new cases for a reaction that already has a Signal, should it add them to that Signal?
- On what schedule does signal detection run, and who is notified of a scheduled run's outcome?
- Which systems of record does each domain integrate first?
- Who runs Sign experiment, Invalidate result and Start CAPA? No persona in section 6 does yet.
- How are a Clinical Research Coordinator and a Clinical Research Associate limited to their own sites? Like the external agent, this needs scoped permissions (platform spec section 3.3).
- Should a visit's window, rather than a single date, set its deadline, as protocols define visit windows?
- How is an external agent limited to its own sites? The role may answer and close queries, but nothing yet ties an agent to particular sites. This is a case of scoped permissions (platform spec section 3.3).
- Comments and design signals should share one annotation model, attached to any object (section 3.4.5). The platform spec has none yet. Should it be added there, domain-free, before Design and Plan builds on it?
- Copy study scenario and Pursue concept copy an object together with its parts. The platform spec's effects create and change objects but do not copy them. How is a deep copy declared?
- A protocol has two faces, a readable document and a connected model. The platform spec composes views of objects, not a document that people write in. What does the experience layer need to offer a document view of an object and its parts?
- A trial simulation runs on a study scenario as it stood at one moment, read from object history. Should the platform spec define reading a set of linked objects as of a moment, so the snapshot can be reproduced and inspected?
- Which models and historical study data back Run trial simulation, and how is each validated for its intended use? Until one is connected, the gateway refuses it, as it refuses Run simulation.
- Which models back Import protocol, and how is a proposed mapping checked?
- Should design objects belong to one protocol version and be copied when it is amended, as USDM study versions do, or be versioned one by one? Copying keeps each version a complete, signed whole and is recommended.
- Which outcome measures does the business define beyond the six in section 3.5, and should a concept's targets pass to the study it seeds?
- Where do clinical supply, risk-based quality and feasibility surveys fit: as further elements of a study scenario, or as plans that follow the selected one?
- How are patient burden and site burden scored? Counting visits and procedures is a start; published scores weight invasive procedures and time on site.
- Program is a type here and also a word used elsewhere in the company. Does it mean the same thing everywhere it is used?
- Some effects are not yet declarative: re-evaluating promotions after a result is invalidated, merging cases, running a simulation model, generating analogs and suggesting follow-up. Drafting a narrative is now declared, as a drafting effect, and detecting signals as a disproportionality analysis (platform spec section 3.4). The ontology describes them in words, and the gateway will implement them. How should they be declared?

---

## 13. Version Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-08 | First domain spec: three domains, cross-domain links, four personas, three journeys, edge case, external agent, seed graph. |
| 0.2 | 2026-11-08 | Closed state gaps the journeys hit: expectedness set at triage so unblinding can precede assessment; added Flag duplicate, Close case, Send for review, Refute signal, Start investigation; Submit marks cases reported; Adverse Event gets an entry state; added Inspection. Renamed Subject to Patient under the patient centricity rule, with participant as the label for studies without a disease state. |
| 0.3 | 2026-11-08 | Reframed for platform development. Added Regulatory Obligations (section 8). Replaced the signal detection stub with Run signal detection. Added Start CAPA, Record CAPA outcome and Close quality event so a held batch can be released. Named who approves submissions. Seed graph scoped to development and testing. |
| 0.4 | 2026-11-08 | Added the Ontology section (9) and renumbered later sections. Closed gaps found while modeling: Triage takes seriousness and expectedness, Patient is enrolled in a Study, Arm and Arm visibility are separate dimensions, Safety Case has a receipt date, Submission records who prepared it and its due date, Record CAPA outcome takes the outcome. External agents may answer and close queries. Two open questions. |
| 0.5 | 2026-11-09 | Namespace renamed to `https://w3id.org/lsh-platform/life-sciences#`, following the platform spec. |
| 0.6 | 2026-11-09 | Seed graph: file, namespace, people, and where each journey starts. Named the object types that hold personal health data. |
| 0.7 | 2026-11-09 | Personas are the canonical roles, with their default permissions; organizations may vary them and people may hold several. |
| 0.8 | 2026-11-09 | Works mainly in sets each role's work domains. Added To do settings: on-demand methods, urgent values and deadlines. Prepare expedited report requires that no submission reports the case yet. |
| 0.9 | 2026-11-11 | Added each method's interaction archetype (section 6). Run simulation and Run signal detection run in the background. |
| 0.10 | 2026-11-11 | The meaning of each signed method's signature. |
| 0.11 | 2026-11-11 | Cases and signals carry coded reactions. Added rule 7, signal detection by disproportionality with Evans criteria; Run signal detection runs it in the background. Run simulation is refused until a model is connected. The seed adds an approved comparator product with 20 historical cases. Four open questions. |
| 0.12 | 2026-11-12 | Generate narrative is declared as a drafting effect with its instructions; accepting the draft sets the case's narrative. Generate analogs is refused until a generative chemistry model is connected. |
| 0.13 | 2026-11-12 | Added the Clinical Research Coordinator and Clinical Research Associate personas. New clinical methods: Complete visit, Record missed visit, Record data, Record adverse event, Verify data record, Verify adverse event, Re-query and Reconcile adverse event. Visits are scheduled with deadlines; adverse events carry verbatim terms and can be reconciled. The seed fleshes out clinical work for each clinical role. Two open questions. |
| 0.14 | 2026-11-13 | Every type titles its objects from a template (section 9), and the seed carries the names they need: compounds, products, the study, sites, lots, visits, queries and inquiries. Methods that create objects record the text their titles use. |
| 0.15 | 2026-11-14 | Relationships read both ways, with containment and at-most-one ends where the domain is certain (section 9), so every object opens with its overview and tabs. |
| 0.16 | 2026-11-14 | Added Protocol to Clinical Development, mapped to NCIt Study Protocol (C70817): versions with a status lifecycle, conducted under by a study and amended by the next version, with Send protocol for review, Approve protocol (signed) and Amend protocol (on demand), run by the Clinical Data Manager. The seed carries VELOCITY-2's protocol in three versions. Added by ontology and seed alone. |
| 0.17 | 2026-11-14 | Report to safety takes a note to safety, recorded on the new Safety Case. Free-text and link inputs are marked as about each object, except a simulation's model type and analogs' target property, so a batch of their method runs one after another (Interaction archetypes, Run for many objects). |
| 0.18 | 2026-11-15 | No property identifies a person directly, so none is marked as identifying one for a model answering questions; free text may still name someone. |
| 0.19 | 2026-11-20 | Added section 3.4, Design and Plan, specified and not yet built: what a design starts from and decides, what a plan decides, and proposed object types, relationships, methods, rules D1 to D8, personas, cross-domain links, journeys J4 to J6, a seed and regulatory obligations. Six open questions. |
| 0.20 | 2026-11-20 | Section 3.4 follows the design note Authoring the Protocol as Structure: Program, Concept, Scenario and Study frame the work; protocol objects are the design; a triad of protocol, budget and site plan is forecast together from historical study data; contributions, design signals and decisions carry the people. Practice fills the gaps the note leaves, marked from practice. Rules D1 to D11, a Medical Writer persona, journeys J4 to J6 and the seed are rewritten. Eight open questions replace the six of 0.19, three of them for the platform spec. |
| 0.21 | 2026-11-20 | Design and Plan is built as a work domain: its 22 object types, state dimensions and relationships (sections 3.5 and 3.6) are in the ontology, with titles, NCIt mappings checked at the source, four personas and a seed. Section 3.4 frames the offering as simulating a trial before it runs, in three spaces: protocol authoring, trial simulation and concepts. Scenario is renamed Study Scenario, with protocol, study budget and site selection; Trial Simulation produces Forecasts measured against Outcome Targets. Methods are specified in section 3.7, not yet built. Send protocol for review now refuses a concept's protocol (rule D1). Open questions updated. |
