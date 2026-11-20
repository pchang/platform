# Domain Spec: Life Sciences Thread

Version 0.19. November 20, 2026. Applies to: Ontology-Driven AI Platform Prompt Specification v0.26.

This spec applies the abstract platform pattern to three related life sciences domains. It defines the domains, their object types, the links between them, the personas, the journeys the platform must support and the regulatory obligations it must meet. It is the first domain applied under section 6 of the platform spec.

The platform spec stays domain-free. Everything domain-specific lives here.

---

## 1. The Thread

The three domains form one lifecycle: from molecule, to patient, to the real world, and back.

1. **Scientific Innovation.** A molecule is designed, tested in the lab and made in a controlled process.
2. **Clinical Development.** The molecule is tested on patients in a clinical trial.
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
| Send protocol for review | Protocol | None | Status is draft | Status: in review |
| Approve protocol | Protocol | Electronic signature (approval) | Status is in review | Status: approved. The version it amends: superseded. Moves the studies the amended version governs to this version |
| Amend protocol | Protocol | What the amendment changes | Status is approved, and no amendment of it is in progress | Creates a Protocol in draft that amends this one, with the summary |

### 3.4 Design and Plan

**Status: specified, not yet built.** This section extends Clinical Development back to where a study begins, before its first site is activated. Its object types, methods, roles and rules are proposals drawn from common industry practice. They are not in the ontology yet, so the spec conformance tests read sections 3.1 and 3.3 only. Solution-specific object types will refine or replace these proposals. When they are agreed, each one moves into 3.1 to 3.3, sections 6, 7 and 11, and the ontology, and this status line is removed.

Design decides what the study must show and how it will show it. Planning decides where, when, with how many patients and at what cost. Most of a study's cost, duration and burden is fixed at this stage. Most later protocol amendments trace back to it, and industry studies of amendments find that many of them could have been avoided. A design that ignores feasibility fails in execution. A plan made without the design's reasons cannot tell which trade-offs are safe. The platform therefore holds design and plan as one connected graph, not as a document and a spreadsheet.

#### 3.4.1 What a design starts from

A study design is not made from nothing. Each of these is an input the design must trace to:

- **Target Product Profile (TPP).** The labeling the sponsor is aiming for: indication, population, dosing, efficacy and safety claims. Every pivotal endpoint should support a TPP claim.
- **Clinical Development Plan (CDP).** The program of studies that takes a candidate from first-in-human to submission. It places each study in sequence and says what decision each study informs.
- **Nonclinical package.** Pharmacology, pharmacokinetics and toxicology from Scientific Innovation. For first-in-human studies, the no observed adverse effect level (NOAEL) or the minimal anticipated biological effect level (MABEL) sets the starting dose.
- **Investigator's Brochure (IB).** Everything known about the investigational product. Its reference safety information decides which adverse reactions are expected, which feeds expedited reporting (rule 1).
- **Prior evidence.** Earlier studies in the program, published trials, natural history data and real-world data on the target population and its standard of care.
- **Regulatory advice.** Agency meetings (for example, FDA pre-IND and end-of-phase-2 meetings, or EMA scientific advice) and disease-specific guidance on endpoints and control groups.
- **Patient and site input.** What matters to patients, what they can bear, and what sites can actually do.

#### 3.4.2 What a design decides

The elements follow the ICH M11 structured protocol and the CDISC Unified Study Definitions Model (USDM), so a design can be exchanged as data rather than as a document.

| Element | What it decides | Practice it follows |
|---|---|---|
| Objectives and endpoints | Primary, secondary and exploratory questions, and the variable that answers each | ICH E8(R1), E9 |
| Estimands | For each key objective, exactly what effect is estimated: the treatment condition, the population, the variable, how intercurrent events (such as rescue medication or stopping treatment) are handled, and the population-level summary | ICH E9(R1) |
| Population and eligibility | Inclusion and exclusion criteria, each testable at screening against named data | ICH E8(R1), E17 for multi-regional studies |
| Interventions and arms | Investigational product, dose and regimen, comparator, placebo or active control, background therapy | ICH E10 |
| Design type | Parallel, crossover, factorial, adaptive, seamless II/III, or a master protocol (basket, umbrella or platform) | FDA and EMA adaptive and master protocol guidance |
| Allocation | Randomization ratio, stratification factors, blinding level and how the blind is kept (matching placebo, double-dummy) | ICH E9 |
| Schedule of activities | Epochs (screening, treatment, follow-up), planned encounters with their windows, and the activities and procedures at each | ICH M11, USDM |
| Sample size | Effect size, variability, power, alpha, dropout, and the margin for non-inferiority studies, each with the source of its assumption | ICH E9 |
| Analysis | Analysis sets, primary analysis method, multiplicity control, interim analyses and their stopping boundaries | ICH E9; the statistical analysis plan |
| Safety oversight | Data monitoring committee, stopping rules, dose-escalation rules, sentinel dosing | ICH E6(R3) |
| Data collection | Which data come from sites, patients (eCOA), devices or health records | CDISC CDASH; FDA digital health technology guidance |

Typical patterns differ by phase:

- **Phase I.** First-in-human, single and multiple ascending dose cohorts, often in healthy volunteers (participants, by the Terminology rule). Dose escalation by rule-based (3+3) or model-based methods (BOIN, CRM). Sentinel dosing, pharmacokinetic sampling and the dose-limiting toxicity window drive the schedule.
- **Phase II.** Proof of concept and dose-ranging in patients. Dose-response modeling (for example, MCP-Mod) selects the Phase III dose. Biomarker and enrichment strategies are tested here.
- **Phase III.** Confirmatory, powered for the primary estimand with strict multiplicity control. It needs a superiority or non-inferiority hypothesis, a justified margin, and large multi-regional enrollment, with a diversity action plan where required.

#### 3.4.3 What a plan decides

| Element | What it decides |
|---|---|
| Feasibility | Whether the design can be run: protocol feasibility (can sites do these procedures?), country feasibility (standard of care, regulation, start-up time) and patient availability (how many eligible patients exist, from real-world and health record data) |
| Country and site selection | Which countries, how many sites in each, and which sites, from their feasibility responses, past enrollment and quality history |
| Enrollment forecast | When the last patient will be enrolled, from the site activation curve, the recruitment rate per site per month, the screen failure rate and the dropout rate. A forecast is a distribution with ranges, never a single date |
| Timeline | Milestones: protocol final, regulatory and ethics approvals, first site activated, first patient in, last patient in, last patient last visit, database lock, clinical study report |
| Budget | Per-patient cost from the schedule of activities, site grants at fair market value, vendor and supply costs |
| Clinical supply | Kits, packaging and labeling for the blind, comparator sourcing, depots, randomization and trial supply management (IRT), and shelf life against the timeline |
| Risk-based quality | Critical-to-quality factors, the risks to them, key risk indicators, and quality tolerance limits at study level (ICH E6(R3), E8(R1)) |
| Data management | Case report forms built from the schedule of activities, edit checks, and SDTM mapping |
| Regulatory and ethics | IND or CTA, ethics committee or IRB submissions, the EU clinical trial application through CTIS, and registration on ClinicalTrials.gov and the EU CT register |

Design and plan push on each other. Every eligibility criterion shrinks the eligible pool. Every visit and procedure adds burden on patients and sites, adds cost, and adds a reason to drop out. The platform makes these trade-offs visible, so each design change shows its effect on the plan before it is committed.

#### 3.4.4 Proposed object types

| Type | What it is | State dimensions |
|---|---|---|
| Development Plan | The clinical development plan for one candidate: the program of studies and the decision each one informs | Status: draft, endorsed, superseded. |
| Target Product Profile | The labeling a program aims for: indication, population, dosing, and its target and minimum efficacy and safety claims | Status: draft, endorsed, superseded. |
| Objective | A question the study answers | Level: primary, key secondary, secondary, exploratory. |
| Endpoint | The variable that answers an objective, with how and when it is measured | Type: efficacy, safety, pharmacokinetic, patient-reported. |
| Estimand | The precise treatment effect an objective targets, with its five ICH E9(R1) attributes | Completeness: incomplete, complete. |
| Eligibility Criterion | One inclusion or exclusion criterion, with the data that tests it | Kind: inclusion, exclusion. Testability: testable, needs data. |
| Arm | A planned treatment group, with its allocation ratio | Role: experimental, active control, placebo control. |
| Epoch | A period of the study, such as screening, treatment or follow-up | None |
| Planned Encounter | A visit in the schedule, with its timing and window. Each Visit is scheduled from one | None |
| Activity | A procedure or assessment in the schedule, such as a blood draw, an ECG or a questionnaire | Purpose: endpoint, eligibility, safety, regulatory, none recorded. |
| Sample Size Calculation | The number of patients needed, from its assumptions, each with its source | Run: not run, complete, failed. |
| Design Scenario | One alternative design for a study, with its predicted size, duration, cost and burden, for comparison with others | Status: draft, under comparison, selected, rejected. |
| Country Plan | A country's place in the study: planned sites, patients and start-up time | Status: proposed, approved, dropped. |
| Feasibility Response | A site's answer to a feasibility survey: its patient pool, competing studies and capabilities | Status: requested, received, assessed. |
| Enrollment Forecast | A forecast of enrollment over time, with ranges | Run: not run, running, complete, failed. Confidence: on track, at risk. |
| Milestone | A planned date in the study timeline, with its forecast and actual dates | Status: planned, at risk, achieved, missed. |
| Study Budget | The study's planned cost, by patient, site and vendor | Status: draft, approved. |
| Supply Plan | How investigational product, comparator and placebo reach sites over the study | Status: draft, approved. Coverage: sufficient, shortfall. |
| Quality Risk | A risk to a critical-to-quality factor, with its indicator and tolerance limit | Status: identified, mitigated, accepted. Level: low, medium, high. |

The existing types keep their meaning. Study gains a design and plan stage before it enrolls: its Status already starts at planned. Protocol stays the versioned, signed record, and the design objects above are its structured content.

#### 3.4.5 Proposed relationships

- Development Plan **for** Compound (cross-domain). Development Plan **includes** Study. Development Plan **aims at** Target Product Profile.
- Protocol **specifies** Objective, Eligibility Criterion, Arm, Epoch and Activity. Each is part of the protocol version that specifies it.
- Objective **measured by** Endpoint. Objective **targets** Estimand. Endpoint **supports** a claim in the Target Product Profile.
- Arm **administers** Formulation (cross-domain).
- Planned Encounter **in** Epoch. Activity **at** Planned Encounter. Activity **serves** Endpoint or Eligibility Criterion. Visit **scheduled from** Planned Encounter.
- Sample Size Calculation **for** Estimand.
- Design Scenario **for** Study. Design Scenario **varies** Protocol (the draft version it would produce).
- Study **planned in** Country Plan. Feasibility Response **from** Site. Feasibility Response **for** Study.
- Enrollment Forecast **for** Study. Milestone **of** Study. Study Budget **for** Study. Supply Plan **for** Study. Supply Plan **draws on** Batch (cross-domain).
- Quality Risk **threatens** Objective or Activity.
- Eligibility Criterion **justified by** Assay Result or Safety Case, where a nonclinical finding or a known risk is the reason for it (cross-domain).

#### 3.4.6 Proposed methods

| Method | On | Needs | Precondition | Effect |
|---|---|---|---|---|
| Add objective | Protocol | Statement, level | Status is draft | Creates an Objective specified by the protocol |
| Define estimand | Objective | Treatment, population, variable, intercurrent event strategies, summary | Level is primary or key secondary | Creates an Estimand the objective targets. Completeness: complete when all five attributes are given |
| Add eligibility criterion | Protocol | Text, kind, the data that tests it | Status is draft | Creates an Eligibility Criterion. Testability: testable when it names its data |
| Draft schedule of activities | Protocol | None | Status is draft, and it has objectives and endpoints | A connected model drafts epochs, planned encounters and activities from the endpoints, eligibility and safety needs, as far as the person may read them. Each activity names its purpose. A person accepts the draft as written or edited |
| Assess patient burden | Protocol | None | It has a schedule of activities | Runs in the background: counts visits, procedures, invasive procedures and time on site per patient, and flags activities that serve no endpoint, criterion or safety need (rule D2) |
| Calculate sample size | Estimand | Effect size, variability, power, alpha, dropout, and the source of each | Completeness is complete | Runs in the background: creates or updates its Sample Size Calculation |
| Create scenario | Study | What changes from the current design | Status is planned | Creates a Design Scenario in draft, with a draft protocol version that carries the change |
| Compare scenarios | Design Scenario | Other scenarios | Two or more scenarios are draft or under comparison | All move to under comparison. Shows size, duration, cost, burden and forecast side by side |
| Select scenario | Design Scenario | Rationale | Status is under comparison | Status: selected. The others: rejected. Its protocol version becomes the draft to send for review |
| Request feasibility | Site | Study | The site has no Feasibility Response for the study | Creates a Feasibility Response in requested |
| Assess feasibility | Feasibility Response | Assessment | Status is received | Status: assessed |
| Select site | Site | None | Its Feasibility Response is assessed | Links the study to run at the site. Site status: selected |
| Forecast enrollment | Study | None | It has country plans and assessed feasibility responses | Runs in the background: creates an Enrollment Forecast with ranges for each enrollment milestone |
| Approve development plan | Development Plan | Electronic signature (approval) | Status is draft | Status: endorsed. The plan it replaces: superseded |

#### 3.4.7 Proposed rules

These become numbered rules in section 7 when built.

- **D1. Estimands before review.** A protocol version cannot be sent for review until every primary and key secondary objective targets a complete estimand.
- **D2. Every activity has a reason.** Each activity serves an endpoint, an eligibility criterion, a safety need or a regulatory requirement. An activity with no recorded purpose is flagged as adding burden without evidence, and it needs a justification to stay.
- **D3. Testable eligibility.** Each eligibility criterion names the data that tests it at screening. A criterion that cannot be tested is flagged before review.
- **D4. Traceable assumptions.** Each sample size assumption records its source. Changing an assumption marks the calculation out of date until it is rerun.
- **D5. Starting dose from evidence.** A first-in-human protocol links its starting dose to the nonclinical results that justify it (NOAEL or MABEL).
- **D6. The blind needs supply.** A blinded design needs a supply plan with matching placebo or double-dummy kits before it is approved.
- **D7. Eligibility changes show their impact.** Adding, removing or changing an eligibility criterion reruns the enrollment forecast, and the person sees the change in eligible patients and in the last-patient-in date before committing.
- **D8. Separation of duties.** The person who authors a protocol version cannot be its only approver (as rule 5).

#### 3.4.8 Proposed personas

| Persona | Works mainly in | Goal | Can | Cannot |
|---|---|---|---|---|
| Clinical Scientist | Clinical Development | A design that answers the right question for the program | Add objectives, eligibility criteria and activities, draft the schedule of activities, create and compare scenarios | Approve their own protocol version. See unblinded arms |
| Biostatistician | Clinical Development | A design that answers the question reliably and efficiently | Define estimands, calculate sample size, set allocation and analysis, compare scenarios | Select sites |
| Clinical Operations Lead | Clinical Development | A plan that delivers the study on time and on budget | Request and assess feasibility, select countries and sites, forecast enrollment, set milestones and budgets | Change objectives or estimands |
| Clinical Supply Manager | Clinical Development and Scientific Innovation | The right product at every site, blind kept, nothing expired | Build and approve supply plans | Change the design |
| Regulatory Strategist | Safety and Regulatory | A design the agencies will accept | Review designs against agency advice, prepare IND and CTA submissions | Approve the protocol alone |

#### 3.4.9 Cross-domain links

| Link | From | To | Why it matters |
|---|---|---|---|
| for | Development Plan | Compound | A program is anchored to the candidate it develops |
| administers | Arm | Formulation | Each arm traces to what was designed and made |
| justified by | Eligibility Criterion | Assay Result or Safety Case | Why a criterion exists is in the graph, not in someone's memory |
| draws on | Supply Plan | Batch | Supply is planned against real lots and their expiry |

A confirmed Signal on a Product reaches back into design. The platform traverses Product to Formulation to the Arms that administer it, to their Protocols and Studies, and suggests reviewing the Investigator's Brochure, the eligibility criteria and the safety activities. That suggestion can lead to Amend protocol.

#### 3.4.10 Proposed journeys

**J4. From candidate to a selected design.** Clinical Scientist, then Biostatistician. The scientist sees a Phase III study, planned, under an endorsed development plan. They add objectives and draft the schedule of activities from the endpoints. The biostatistician defines the primary estimand and calculates the sample size. The scientist creates a second scenario with one fewer visit and a broader eligibility criterion. Compare scenarios shows the size, duration, cost, patient burden and forecast of each. The scientist selects one with a rationale, and its protocol version goes for review.

**J5. An eligibility change and its cost.** Clinical Operations Lead. The enrollment forecast for a study is at risk. The lead asks why. The platform traces the risk to a high screen failure rate on one exclusion criterion. The lead proposes relaxing it, and rule D7 shows the forecast change before anything is committed. The change becomes an amendment through Amend protocol.

**J6. From a confirmed signal to a protocol amendment.** Continues J2. A confirmed Signal on the product reaches its studies through Formulation and Arm. The Clinical Scientist is asked to review the eligibility criteria and the safety activities, adds liver function monitoring to the schedule, and amends the protocol.

#### 3.4.11 Proposed seed

VELOCITY-3, a planned Phase III study of Velcorin in moderate to severe rheumatoid arthritis, under a development plan for LSH-4471 with an endorsed target product profile. It has a draft protocol with a primary objective (ACR20 response at Week 24 against placebo, on top of methotrexate), its estimand, 14 eligibility criteria and a drafted schedule of activities. Two design scenarios, 4 country plans, 10 feasibility responses (7 received), and an enrollment forecast at risk. All of it is invented.

#### 3.4.12 Regulatory obligations for design and plan

| Obligation | What the platform must do |
|---|---|
| General considerations and quality by design (ICH E8(R1)) | Record the critical-to-quality factors of each design and the risks to them |
| Statistical principles and estimands (ICH E9, E9(R1)) | Hold estimands as structured objects and trace sample size and analysis to them |
| Choice of control group (ICH E10) | Record the control and its justification on each arm |
| Good clinical practice (ICH E6(R3)) | Risk-proportionate design, quality tolerance limits, and oversight decisions logged |
| Structured protocol (ICH M11; CDISC USDM) | Export a protocol version as an M11 protocol and as USDM data |
| Multi-regional trials (ICH E17) | Record regional sample size and consistency assumptions |
| Diversity action plans (FDA, under FDORA 2022) | Record enrollment goals by demographic group for studies that need a plan |
| EU Clinical Trials Regulation (536/2014) | Produce the application content for CTIS and record transparency deadlines |
| Trial registration (42 CFR Part 11; EU CT register) | Register before the first patient is enrolled, with results deadlines tracked |

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
| Quality Lead | Scientific Innovation and Safety and Regulatory | Keep every batch compliant | Release and quarantine batches, open, investigate and close quality events, assign CAPAs and record their outcomes | Assess safety cases |

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

- **Drafting instructions.** The instructions a model follows to draft a case narrative are in `methods.ttl`, with the method. They ask for an ICH E2B(R3) case narrative built only from the records given, with what is not recorded said plainly, the patient never called a subject, and identifiers instead of names.
- **Reactions.** A case's reactions, and a signal's reaction, are SKOS concepts mapped to NCIt. They stand in for MedDRA preferred terms, the standard for coding reactions, until MedDRA is licensed.
- **Terminologies.** NCIt first, because it is free. Every NCIt mapping was checked against the NCI Thesaurus service. MedDRA and WHODrug follow once licensed.
- **Tests** keep the ontology and this spec in step: every object type, state value and method in sections 2 to 4 must exist in the ontology, and the journeys' preconditions are tested against small example graphs.

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
- Six people, one for each persona, plus a second Drug Safety Physician so a submission can be approved by someone other than its preparer (rule 5).
- One external agent, a contract research organization's, for the External agent journey.

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
- Should design objects (objectives, criteria, arms, epochs, activities) belong to one protocol version and be copied when it is amended, as USDM study versions do, or be versioned one by one? Copying keeps each version a complete, signed whole and is recommended. The platform spec does not yet say how containment works across versions.
- Which models back Draft schedule of activities, Calculate sample size and Forecast enrollment, and how are they validated? Sample size has closed-form methods for common designs; forecasting needs historical site performance the seed does not yet have.
- How is patient burden scored? Counting visits and procedures is a start, but published burden and complexity scores weight invasive procedures and time on site.
- Which real-world data sources estimate eligible patient pools, and how are their counts kept away from patient-level identifiers?
- Should Design Scenario be its own type, or a draft Protocol version that has not been sent for review?
- Which of the proposed design and plan types (section 3.4) are replaced by the solution's own object types?
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
