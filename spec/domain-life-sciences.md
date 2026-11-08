# Domain Spec: Life Sciences Thread

Version 0.4. November 8, 2026. Applies to: Ontology-Driven AI Platform Prompt Specification v0.6.

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
| Study | A clinical trial of one or more formulations, in patients or in people without the disease (for example, healthy volunteers) | Phase: I, II, III. Status: planned, enrolling, active, closed, locked. Blinding: blinded, unblinded. |
| Site | A hospital or clinic running the study | Status: selected, activated, closed. Payment: current, overdue. |
| Patient | A person enrolled in a study. Labeled participant in studies without a disease state (see Terminology) | Enrollment: screened, consented, randomized, completed, withdrawn. Arm: unassigned, assigned. Arm visibility: hidden, revealed. The assigned arm itself is hidden while the study is blinded (rule 2). |
| Visit | A scheduled encounter with a patient | Status: scheduled, completed, missed. |
| Data Record | A captured data point (lab value, vital sign, diary entry, device reading) | Entry: entered, verified. Source: site, patient, device, health record. |
| Data Query | A question raised about a Data Record | Status: open, answered, closed. |
| Adverse Event | Something harmful that happened to a patient during the study | Entry: entered, verified. Seriousness: non-serious, serious. Outcome: ongoing, resolved. Reporting: not reported, reported to safety. |

### 3.2 Relationships

- Study **tests** Formulation (cross-domain).
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
| Raise query | Data Record | Question | Entry is entered | Creates a Data Query in open |
| Answer query | Data Query | Answer | Status is open | Status: answered |
| Close query | Data Query | None | Status is answered | Status: closed |
| Report to safety | Adverse Event | None | Not reported | Creates a Safety Case (cross-domain). Reporting: reported to safety |
| Unblind patient | Patient | Justification | Study is blinded, arm is hidden, and rule 2 allows it | Arm visibility: revealed, for this patient only. Logged with its justification |
| Lock study | Study | None | Status closed, no open Data Queries | Status: locked |

---

## 4. Domain: Safety and Regulatory

Covers patient safety and regulatory obligations, during trials and after launch.

### 4.1 Object types

| Type | What it is | State dimensions |
|---|---|---|
| Safety Case | One report of an adverse reaction in one patient. Has a date of receipt | Workflow: received, triaged, assessed, reported, closed. Seriousness: non-serious, serious. Expectedness: expected, unexpected. Causality: unassessed, unrelated, possible, probable. |
| Product | A marketed or investigational product | Status: investigational, approved, withdrawn. |
| Signal | A possible new risk detected across many cases | Status: detected, under evaluation, confirmed, refuted. |
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
| Generate narrative | Safety Case | None | Workflow is triaged or later | Drafts the case narrative for human review |
| Merge duplicate | Safety Case | Target case | Cases are linked by duplicate of | Merges into target. Source workflow: closed |
| Prepare expedited report | Safety Case | None | Assessed, serious, unexpected, possible or probable | Creates a Submission in draft, prepared by the person, due 15 days after the case was received (rule 1) |
| Close case | Safety Case | None | Workflow is reported, or assessed and no expedited report is required | Workflow: closed |
| Send for review | Submission | Reviewer | Status is draft | Status: in review |
| Submit | Submission | Approver | Status is in review | Status: submitted. Each Safety Case it reports moves to Workflow: reported |
| Run signal detection | Product | None | Product has Safety Cases | Creates a Signal in detected for each product and event pair whose disproportionality exceeds the threshold in business context. Also runs on the schedule set there |
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

| Persona | Works mainly in | Goal | Can | Cannot |
|---|---|---|---|---|
| Computational Chemist | Scientific Innovation | Find a better compound | Run simulations, generate analogs, register and promote compounds | See patient-level clinical data |
| Clinical Data Manager | Clinical Development | Get clean data to study lock | Raise and close queries, report adverse events to safety, lock studies | See unblinded arms. Change safety assessments |
| Drug Safety Physician | Safety and Regulatory | Protect patients and meet reporting deadlines | Triage, assess, flag and merge cases, run detection and evaluate, confirm and refute signals, request unblinding, prepare submissions and approve those they did not prepare | Change clinical data. Release batches |
| Quality Lead | Scientific Innovation and Safety and Regulatory | Keep every batch compliant | Release and quarantine batches, open, investigate and close quality events, assign CAPAs and record their outcomes | Assess safety cases |

An external agent, such as a contract research organization's, may answer and close Data Queries at its own sites (see External agent in section 10).

The same object must look different to each persona. A Batch is a production record to the Quality Lead, a supply item to the Clinical Data Manager and a possible cause to the Drug Safety Physician. The platform must explain why each persona sees what it sees.

---

## 7. Business Context

Rules the Guard agent enforces. They are data in the business context, not code.

1. **Expedited reporting.** A serious, unexpected case with possible or probable causality must be submitted within 15 days of receipt. Within 3 days of the deadline, its Submission is due soon.
2. **Blinding.** While a study is blinded, no persona sees a patient's arm. A Drug Safety Physician may unblind one patient only when that patient's Safety Case is triaged as serious and unexpected, so the arm is needed to assess causality for a possible expedited report. Every unblinding is logged with its justification.
3. **Batch release.** A batch with an open Quality Event cannot be released.
4. **Data integrity.** Signed experiments and verified data records cannot be edited. They can only be corrected by a new linked record.
5. **Separation of duties.** The person who prepares a Submission cannot approve it.
6. **Human review.** Generated narratives and generated analogs are drafts until a human accepts them.

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

- **Namespace.** `https://example.org/lsh/life-sciences#`, a placeholder until the platform namespace is chosen.
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
- 1 blinded Phase II study at 3 sites with 12 patients, 2 arms and about 40 data records, 4 open queries.
- 3 adverse events, 1 of them serious and unexpected.
- 6 safety cases, including 1 duplicate pair, linked to 1 investigational product.
- 1 detected signal aggregating 3 cases.
- 1 open quality event and 1 submission in draft.

All names, compounds, sites and people are invented.

---

## 12. Open Questions

- Should a fourth persona represent the regulator, consuming Submissions through the gateway?
- Should post-market cases (after approval) be in scope, or only trial cases?
- Which models back Run simulation and Generate analogs, and how are they validated for their intended use?
- Which systems of record does each domain integrate first?
- Who runs Sign experiment, Invalidate result, Consent, Randomize and Start CAPA? No persona in section 6 does yet.
- Some effects are not yet declarative: re-evaluating promotions after a result is invalidated, merging cases, drafting a narrative, detecting signals and suggesting follow-up. The ontology describes them in words, and the gateway will implement them. How should they be declared?

---

## 13. Version Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-08 | First domain spec: three domains, cross-domain links, four personas, three journeys, edge case, external agent, seed graph. |
| 0.2 | 2026-11-08 | Closed state gaps the journeys hit: expectedness set at triage so unblinding can precede assessment; added Flag duplicate, Close case, Send for review, Refute signal, Start investigation; Submit marks cases reported; Adverse Event gets an entry state; added Inspection. Renamed Subject to Patient under the patient centricity rule, with participant as the label for studies without a disease state. |
| 0.3 | 2026-11-08 | Reframed for platform development. Added Regulatory Obligations (section 8). Replaced the signal detection stub with Run signal detection. Added Start CAPA, Record CAPA outcome and Close quality event so a held batch can be released. Named who approves submissions. Seed graph scoped to development and testing. |
| 0.4 | 2026-11-08 | Added the Ontology section (9) and renumbered later sections. Closed gaps found while modeling: Triage takes seriousness and expectedness, Patient is enrolled in a Study, Arm and Arm visibility are separate dimensions, Safety Case has a receipt date, Submission records who prepared it and its due date, Record CAPA outcome takes the outcome. External agents may answer and close queries. Two open questions. |
