# Domain Spec: Life Sciences Thread

Version 0.1. November 8, 2026. Applies to: Ontology-Driven AI Platform Prompt Specification v0.2.

This spec applies the abstract platform pattern to three related life sciences domains. It defines the domains, their object types, the links between them, the personas and the journeys the demo must run. It satisfies section 6 of the platform spec.

The platform spec stays domain-free. Everything domain-specific lives here.

---

## 1. The Thread

The three domains form one lifecycle: from molecule, to patient, to the real world, and back.

1. **Scientific Innovation.** A molecule is designed, tested in the lab and made in a controlled process.
2. **Clinical Development.** The molecule is tested on patients in a clinical trial.
3. **Safety and Regulatory.** What happens to patients is monitored, assessed and reported to regulators, during the trial and after launch.

What is learned in each domain flows back to the others. A safety signal sends scientists back to the molecule. A manufacturing deviation can explain an adverse event. The links between domains are the point of the demo.

### Reference grounding

Each domain is modeled on the scope of an existing Dassault Systèmes brand. The brands ground the model in real practice. The demo itself uses discipline names and fictional data. It does not use product names, logos or real records.

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
| Run simulation | Compound | Model type | Compound is designed or later | Creates a Simulation in queued |
| Generate analogs | Compound | Target property | Compound has at least one accepted Simulation | Creates new Compounds in designed, linked by derived from |
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
| Study | A clinical trial of one or more formulations | Phase: I, II, III. Status: planned, enrolling, active, closed, locked. Blinding: blinded, unblinded. |
| Site | A hospital or clinic running the study | Status: selected, activated, closed. Payment: current, overdue. |
| Subject | A patient enrolled in a study | Enrollment: screened, consented, randomized, completed, withdrawn. Arm: assigned, hidden while the study is blinded. |
| Visit | A scheduled encounter with a subject | Status: scheduled, completed, missed. |
| Data Record | A captured data point (lab value, vital sign, diary entry, device reading) | Entry: entered, verified. Source: site, patient, device, health record. |
| Data Query | A question raised about a Data Record | Status: open, answered, closed. |
| Adverse Event | Something harmful that happened to a subject during the study | Seriousness: non-serious, serious. Outcome: ongoing, resolved. Reporting: not reported, reported to safety. |

### 3.2 Relationships

- Study **tests** Formulation (cross-domain).
- Study **runs at** Site. Subject **enrolled at** Site.
- Subject **receives** Batch (cross-domain, via study drug supply).
- Visit **for** Subject. Data Record **captured at** Visit.
- Data Query **raised on** Data Record.
- Adverse Event **experienced by** Subject.

### 3.3 Methods

| Method | On | Needs | Precondition | Effect |
|---|---|---|---|---|
| Consent | Subject | eConsent record | Enrollment is screened | Enrollment: consented |
| Randomize | Subject | None | Enrollment is consented, study is enrolling | Enrollment: randomized, Arm: assigned |
| Raise query | Data Record | Question | Entry is entered | Creates a Data Query in open |
| Answer query | Data Query | Answer | Status is open | Status: answered |
| Close query | Data Query | None | Status is answered | Status: closed |
| Report to safety | Adverse Event | None | Not reported | Creates a Safety Case (cross-domain). Reporting: reported to safety |
| Unblind subject | Subject | Justification | Study is blinded | Reveals Arm for this subject only. Requires policy approval (see 7) |
| Lock study | Study | None | Status closed, no open Data Queries | Status: locked |

---

## 4. Domain: Safety and Regulatory

Covers patient safety and regulatory obligations, during trials and after launch.

### 4.1 Object types

| Type | What it is | State dimensions |
|---|---|---|
| Safety Case | One report of an adverse reaction in one patient | Workflow: received, triaged, assessed, reported, closed. Seriousness: non-serious, serious. Expectedness: expected, unexpected. Causality: unassessed, unrelated, possible, probable. |
| Product | A marketed or investigational product | Status: investigational, approved, withdrawn. |
| Signal | A possible new risk detected across many cases | Status: detected, under evaluation, confirmed, refuted. |
| Submission | A regulatory filing to an authority | Status: draft, in review, submitted, acknowledged. Deadline: on track, due soon, overdue. |
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
| Triage | Safety Case | None | Workflow is received | Workflow: triaged. Sets seriousness |
| Assess | Safety Case | Causality, expectedness | Workflow is triaged | Workflow: assessed |
| Generate narrative | Safety Case | None | Workflow is triaged or later | Drafts the case narrative for human review |
| Merge duplicate | Safety Case | Target case | Cases are linked by duplicate of | Merges into target. Source workflow: closed |
| Prepare expedited report | Safety Case | None | Assessed, serious, unexpected, possible or probable | Creates a Submission in draft with a deadline |
| Submit | Submission | Approver | Status is in review | Status: submitted |
| Evaluate signal | Signal | None | Status is detected | Status: under evaluation |
| Confirm signal | Signal | Rationale | Under evaluation | Status: confirmed. Suggests follow-up in other domains |
| Open quality event | Batch | Description, severity | None | Creates a Quality Event in open |
| Assign CAPA | Quality Event | Owner, action | Status is investigating | Creates a CAPA. Status: CAPA assigned |

---

## 5. Cross-Domain Links

These links are the demo's main proof that domains connect through the graph, not through special code.

| Link | From | To | Why it matters |
|---|---|---|---|
| tests | Study | Formulation | A trial is anchored to what the lab designed |
| receives | Subject | Batch | A patient can be traced to the exact lot they took |
| originates from | Safety Case | Adverse Event | A trial adverse event becomes a safety case without re-entry |
| is | Product | Formulation | The safety view and the lab view are the same thing |
| may involve | Safety Case | Batch | A safety problem can be traced to manufacturing |
| raised on | Quality Event | Batch | Quality and manufacturing share one record of a lot |

Confirming a Signal on a Product lets agents traverse back to the Formulation, its Compound and its Batches. Nothing in the code knows this path. It exists because the links exist.

---

## 6. Personas

| Persona | Works mainly in | Goal | Can | Cannot |
|---|---|---|---|---|
| Computational Chemist | Scientific Innovation | Find a better compound | Run simulations, generate analogs, register and promote compounds | See subject-level clinical data |
| Clinical Data Manager | Clinical Development | Get clean data to study lock | Raise and close queries, report adverse events to safety, lock studies | See unblinded arms. Change safety assessments |
| Drug Safety Physician | Safety and Regulatory | Protect patients and meet reporting deadlines | Triage and assess cases, evaluate signals, request unblinding | Change clinical data. Release batches |
| Quality Lead | Scientific Innovation and Safety and Regulatory | Keep every batch compliant | Release and quarantine batches, open quality events, assign CAPAs | Assess safety cases |

The same object must look different to each persona. A Batch is a production record to the Quality Lead, a supply item to the Clinical Data Manager and a possible cause to the Drug Safety Physician. The platform must explain why each persona sees what it sees.

---

## 7. Business Context

Rules the Guard agent enforces. They are data in the business context, not code.

1. **Expedited reporting.** A serious, unexpected case with possible or probable causality must be submitted within 15 days of receipt. Within 3 days of the deadline, its Submission is due soon.
2. **Blinding.** While a study is blinded, no persona sees a subject's arm. A Drug Safety Physician may unblind one subject only when that subject has a serious, unexpected adverse event and the result is needed for an expedited report. Every unblinding is logged with its justification.
3. **Batch release.** A batch with an open Quality Event cannot be released.
4. **Data integrity.** Signed experiments and verified data records cannot be edited. They can only be corrected by a new linked record.
5. **Separation of duties.** The person who prepares a Submission cannot approve it.
6. **Human review.** Generated narratives and generated analogs are drafts until a human accepts them.

---

## 8. Journeys

Each journey runs the full core loop (platform spec section 4).

### J1. From trial adverse event to expedited report
**Persona:** Clinical Data Manager, then Drug Safety Physician.

1. **Orient.** The Clinical Data Manager sees the study with open queries and a new serious adverse event surfaced as a starting point.
2. **Find.** They open the adverse event.
3. **Choose.** Report to safety is offered. Edit is not, because the record is verified.
4. **Declare.** "Send this to safety."
5. **Compose.** A view confirms the subject, event and seriousness, and previews the Safety Case that will be created.
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
5. **Compose.** A view previews the quarantine and lists every subject who received the batch and every Safety Case that may involve it.
6. **Commit.** The Batch is quarantined and a CAPA is assigned.
7. **Continue.** The platform suggests the Drug Safety Physician review the linked cases.

### Edge case: unblinding inside J1
In J1, the Drug Safety Physician needs the subject's arm to assess causality. The study is blinded.

No code handles this case. The Act agent sees Unblind subject is gated by policy. The Guard agent reads rule 7.2, checks that the adverse event is serious and unexpected and that an expedited report is being prepared, and allows the unblinding for this subject only. If the event were non-serious, the Guard would block it and explain which condition failed. The Clinical Data Manager still cannot see the arm.

A second candidate edge case: the same adverse event arrives twice, once from the trial and once as a medical inquiry. The Find agent flags the likely duplicate by similarity and the physician merges it.

### External agent
A contract research organization's agent connects through the gateway with no UI. It lists open Data Queries at its sites, answers them from its own records and closes the ones it can. Everything it does is checked by the same policy and appears in the same log as a human's actions.

---

## 9. Seed Graph

Small and fictional. Enough to run every journey.

- One research program with 5 compounds, including 1 candidate and 2 analogs.
- 1 formulation of the candidate, 1 validated process and 3 batches. One batch has high deviation risk.
- 1 blinded Phase II study at 3 sites with 12 subjects, 2 arms and about 40 data records, 4 open queries.
- 3 adverse events, 1 of them serious and unexpected.
- 6 safety cases, including 1 duplicate pair, linked to 1 investigational product.
- 1 detected signal aggregating 3 cases.
- 1 open quality event and 1 submission in draft.

All names, compounds, sites and people are invented.

---

## 10. Open Questions

- Should a fourth persona represent the regulator, consuming Submissions through the gateway?
- Should post-market cases (after approval) be in scope, or only trial cases?
- How much of the generative design (analog generation) should the demo simulate versus stub?

---

## 11. Version Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-08 | First domain spec: three domains, cross-domain links, four personas, three journeys, edge case, external agent, seed graph. |
