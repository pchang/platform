# Domain Spec: Clinical Data Management

Version 0.2. November 24, 2026. Applies to: Ontology-Driven AI Platform Prompt Specification v0.43. Status: **proposed, mostly not built.** Measures, datasets, dataset versions and data points are built at the platform level (platform spec 3.2, Measures and observations), with Blood Pressure in the life sciences domain (section 3.10 there); the rest is not built yet.

This spec describes the objects a clinical data management system holds, as the platform would represent them: what each object is, the states it moves through, what it records and what it links to. It covers how data is collected and gathered into datasets, transformed and stored, watched for problems, monitored statistically and against key risk indicators and quality tolerance limits, managed for risk, and made traceable through audit trails and their review.

It extends the Clinical Development domain of `domain-life-sciences.md` (section 3) rather than replacing it. Study, Protocol, Site, Patient, Visit, Data Record, Data Query and Adverse Event are already defined there and are reused here as they are. The platform spec stays domain-free; everything here is domain-specific.

**Terminology.** A person in a study is a **patient**, or a **participant** where the study has no disease state, never a subject (see the Terminology section of `domain-life-sciences.md`). Where a standard's own name for a field says otherwise, this spec still uses patient and names the standard's field only where it must.

---

## 1. Scope and grounding

**In scope.** The objects data managers, central monitors, risk managers, clinical programmers and quality reviewers work with, from the design of data collection to database lock and archive.

**Out of scope here.** Safety case processing, signal detection and regulatory submissions, which are in Safety and Regulatory; and statistical analysis itself, which consumes the analysis datasets described here.

**Grounding.** Each object is mapped to an established standard or guideline where one exists. A new term is minted only where none fits (platform spec 3.1, Ground in terminologies).

| Source | What it grounds |
|---|---|
| ICH E6(R3), Good Clinical Practice | Risk-based quality management, critical-to-quality factors, quality tolerance limits, data governance, computerized systems, audit trails |
| ICH E8(R1), General Considerations for Clinical Studies | Critical-to-quality factors and quality by design |
| EMA Guideline on computerised systems and electronic data in clinical trials (2023) | Audit trails and their review, data transfers, archiving, access control |
| MHRA GXP Data Integrity Guidance (2018) | ALCOA+ principles, audit trail review, data lifecycle |
| FDA 21 CFR Part 11 | Audit trails, electronic records and signatures |
| CDISC CDASH, ODM, SDTM, ADaM, Define-XML, Dataset-JSON | Data collection design, exchange, tabulation and analysis datasets, dataset metadata |
| TransCelerate RBQM and RACT | Risk assessment, key risk indicators, centralized monitoring |
| MedDRA, WHODrug | Coding of verbatim terms |

---

## 2. How the objects fit together

Data is **designed** (data collection specification, forms, items, edit checks), **captured** (data records, form instances) from **data sources** and **data transfers**, and **gathered** into **datasets**, which are **transformed** from raw to tabulation to analysis by **transformations** whose **runs** leave lineage. Everything lives in **data stores** under **retention policies**, frozen by **database locks** and kept in **archive packages**.

Quality is **planned** (critical-to-quality factors, risks, a risk assessment, a monitoring plan, KRIs and QTLs) and **watched** (surveillance rules, review listings, statistical monitoring runs, KRI and QTL measurements). What the watching finds becomes **alerts**, which people turn into **findings** and **issues**, resolved through **queries**, **protocol deviations** or **CAPAs**. Every change to every record is in an **audit trail**, which people **review** to a plan, recording what they find.

In the platform's terms: a design object is a template other objects are made from; a captured object is data; a definition object, such as a KRI, says how something is measured, and its measurement objects are the results; a run object is a background run (platform spec 3.4); and a review or issue object is work a person does, with a lifecycle and To do.

---

## 3. Data design and capture

How a study's data is designed and collected. The design objects are versioned with the protocol: a protocol amendment can bring a new version of the data collection specification.

| Type | What it is | State dimensions | Key properties and links |
|---|---|---|---|
| Data Collection Specification | The design of what a study collects, where and when: its forms, items, edit checks and schedule, for one protocol version. CDISC ODM and CDASH | Status: draft, in testing, approved, live, retired | Version; specified for a Protocol; contains Forms, Edit Checks; replaces an earlier version |
| Form | A designed case report form, such as Vital Signs or Concomitant Medications. CDASH domain | Status: draft, approved, retired | Name, CDASH domain; part of a Data Collection Specification; holds Items; collected at Planned Visits |
| Item | One field on a form: its question, data type, unit, controlled terminology and whether it is required. CDASH variable | Status: draft, approved, retired | Label, data type, unit, codelist (a value set, platform spec 3.7), required; part of a Form; mapped to SDTM variables |
| Edit Check | A rule that checks data as it is entered or after, raising a query when it fails. A range, consistency, completeness or cross-form check | Status: draft, in testing, active, retired. Kind (classifying): range, consistency, completeness, cross-form, protocol | Logic in words and as an expression, severity, query text; checks Items; part of a Data Collection Specification |
| Form Instance | One form as captured for one patient at one visit, holding its data records | Entry: not started, in progress, complete, verified, locked. Exits: not done (with the reason) | Belongs to a Patient and a Visit; instance of a Form; signed by the investigator where required |
| Data Record | Already defined in Clinical Development: one captured value, with its unit, collection date and source | As defined | Part of a Form Instance; instance of an Item; queried by Data Queries |
| Measure | A standard observation defined once for every study, such as blood pressure, as shapes: its components with their datatypes, units, plausible ranges and terminology codes. CDISC Biomedical Concepts. Platform-level (platform spec 3.2) | Structure, changed by change sets | Has Measure Components; measured by Assessments; bound to Datasets by Measure Bindings |
| Measure Binding | How one dataset holds one component of a measure: the column and value that pick its rows, and the columns of its value and unit. CDISC dataset specializations | Structure | Binds a Measure Component to a Dataset |
| Data Point | A reference to one value a person must act on, rather than a copy of it: an observation expected and missing, or a value its measure's shape does not allow, found by checking a dataset version. Values that need no action stay rows of their dataset version | Kind (classifying): missing, not allowed. Status: open, explained, resolved | Of a Patient, at a Visit, for a Measure Component, seen in a Dataset Version; the value and unit seen |
| Data Query | Already defined in Clinical Development. A question raised about a data record, by an edit check, a reviewer or a monitor | As defined | Raised by an Edit Check, a Data Review, an Alert or a person |
| Data Source | A system or party that data comes from: the EDC, eCOA, IRT, a central laboratory, an imaging core lab, a device or a health record | Status: planned, connected, live, disconnected | Kind (classifying): EDC, eCOA, IRT, laboratory, imaging, device, health record, safety; vendor; contributes to a Study |
| Data Transfer Agreement | What an external data source sends, how and how often: its file structure, variables, codelists, transfer schedule and checks | Status: draft, agreed, in effect, superseded | Version; between a Data Source and a Study; specifies a Dataset Specification |
| Data Transfer | One delivery of data from an external source: a file or a feed, received and checked against its agreement before it is loaded | Status: received, checked, loaded. Exits: rejected (with the reasons) | Received on, record count, checksum; under a Data Transfer Agreement; loads into a Dataset Version |
| Coding Request | A verbatim term, such as a medication or an adverse event as the site wrote it, to be coded to a dictionary term | Status: pending, coded, approved. Exits: queried back to the site | Verbatim term, dictionary (MedDRA, WHODrug) and its version, coded term; for a Data Record or an Adverse Event |
| Reconciliation | A comparison of the same facts held in two places, such as adverse events in the EDC and in the safety database, or laboratory data in the EDC and in a vendor transfer, with its discrepancies | Status: planned, in progress, discrepancies open, reconciled | Between two Datasets or Data Sources; as of a date; finds Discrepancies |
| Discrepancy | One mismatch a reconciliation found, such as an event in one system and not the other | Status: open, resolved, closed. Exits: accepted as is (with the reason) | Part of a Reconciliation; about Data Records; resolved by Data Queries |

---

## 4. Datasets

A dataset is a named collection of data, structured to a specification, at one stage of its life. The same study has raw datasets as collected and transferred, tabulation datasets in SDTM, analysis datasets in ADaM, and operational datasets for monitoring. Datasets are versioned by data cut, so any result can say exactly what data it rests on.

| Type | What it is | State dimensions | Key properties and links |
|---|---|---|---|
| Dataset Specification | The structure a dataset must have: its variables, their types, lengths, codelists, keys and origin. Define-XML | Status: draft, approved, in use, superseded | Standard and version (SDTM IG, ADaM IG, sponsor raw); domain, such as AE or ADSL; has Variable Definitions |
| Variable Definition | One variable of a dataset specification: name, label, type, length, codelist, origin (collected, derived, assigned, predecessor) and derivation | Status: draft, approved, superseded | Part of a Dataset Specification; derived by a Derivation Rule; traced to Items |
| Dataset | A named dataset of a study, such as raw laboratory data, the SDTM AE domain or the ADaM ADSL | Stage (classifying): raw, tabulation, analysis, operational. Status: in development, validated, released, retired | Name, domain; conforms to a Dataset Specification; held in a Data Store; derived from other Datasets |
| Dataset Version | A dataset as it was at one data cut: its records frozen, its checksum and record count, and what produced it | Status: created, validated, released. Exits: invalidated (with the reason) | Data cut date, record count, checksum, format (SAS XPORT, Dataset-JSON, Parquet); version of a Dataset; produced by a Transformation Run or loaded by a Data Transfer; part of a Data Cut |
| Data Cut | A defined point at which data is taken for a purpose, such as an interim analysis, a data monitoring committee review or the final analysis, with every dataset version taken at it | Status: planned, taken, validated, released | Cut date, purpose; for a Study; holds Dataset Versions; blinded or unblinded |

---

## 5. Data transformations

How data moves from raw to tabulation to analysis, and why every value can be traced back to where it came from.

| Type | What it is | State dimensions | Key properties and links |
|---|---|---|---|
| Mapping Specification | How one target dataset is built from its sources: which source variables become which target variables, and how | Status: draft, reviewed, approved, superseded | Version; targets a Dataset Specification; from source Dataset Specifications; has Derivation Rules |
| Derivation Rule | How one target variable's value is derived, such as a baseline flag, a study day or a treatment-emergent flag, in words and as code | Status: draft, reviewed, approved, superseded | Rule text, code reference; for a Variable Definition; part of a Mapping Specification |
| Transformation | A program or pipeline that builds a dataset from others under a mapping specification, at a version of its code | Status: in development, validated, in production, retired | Code repository and version, language; implements a Mapping Specification; reads source Datasets; writes a target Dataset; validated by a Validation Run |
| Transformation Run | One execution of a transformation on one data cut, a background run (platform spec 3.4) that records its lineage: the input versions, the code version and the output | Status: queued, running, succeeded. Exits: failed (with the log) | Started, ended, environment; run of a Transformation; reads Dataset Versions; produces Dataset Versions |
| Validation Run | A check of a dataset version against its standard and specification, such as conformance rules for SDTM and Define-XML, or a double-programming comparison | Status: queued, running, completed. Exits: failed | Rule set and version; validates a Dataset Version; finds Validation Findings |
| Validation Finding | One problem a validation run found, such as a variable outside its codelist or a missing required variable | Status: open, explained, fixed. Exits: accepted (with the explanation, for the reviewer's guide) | Rule, severity, record count; found by a Validation Run; in a Dataset Version |

---

## 6. Data storage

Where data lives, who may see it, how long it is kept, and how it is frozen and archived.

| Type | What it is | State dimensions | Key properties and links |
|---|---|---|---|
| Data Store | A place data is held, such as the EDC database, a clinical data repository or a zone of a data lake (landing, raw, conformed, analysis) | Status: provisioned, validated, in use, decommissioned | Kind (classifying): operational database, repository, data lake zone, archive; hosting region; validated computerized system; holds Datasets |
| Access Group | Who may see what in a data store, notably the separation of unblinded data from blinded teams | Status: requested, approved, active, revoked | Blinding (classifying): blinded, unblinded; grants access to Data Stores or Datasets; members are People. Platform roles and permissions apply (platform spec 3.3) |
| Retention Policy | How long a kind of record is kept, where, and when it may be destroyed, by jurisdiction | Status: draft, approved, in effect, superseded | Retention period, trigger (such as the end of the study or the marketing authorization), jurisdictions; governs Data Stores and Archive Packages |
| Database Lock | Freezing a study's data so it can be analyzed: the checklist done first, the lock itself, and any unlock with its justification | Status: planned, checklist in progress, soft locked, hard locked. Exits: unlocked (with the justification and approval) | Lock date; for a Study or a Data Cut; signed by the people its checklist names. The study's Status "locked" (Clinical Development) follows a hard lock |
| Archive Package | A study's data, metadata, audit trails and documentation, packaged to be kept and read for the retention period, in an open format, with its checksum | Status: assembling, verified, archived. Exits: failed verification | Contents, format, checksum, location; for a Study; under a Retention Policy |

---

## 7. Data surveillance and alerts

How data is watched as it arrives, by rules and by people, and what happens to what they find. These objects are shared by the monitoring described in sections 8 to 10: a KRI, a QTL or a statistical test raises an alert in the same way a surveillance rule does.

| Type | What it is | State dimensions | Key properties and links |
|---|---|---|---|
| Surveillance Rule | A rule that watches data across records, forms or patients and raises an alert when it finds something, such as a missing visit, a late entry, an implausible trend or an unreported serious event | Status: draft, in testing, active, retired | Logic in words and as a query, frequency, severity, who is alerted; watches Datasets or Data Sources; defined for a Study |
| Data Review Listing | A designed listing or report that data managers or medical reviewers read, such as all serious events, laboratory values outside range or concomitant medications without an indication | Status: draft, approved, in use, retired | Columns, filters, review frequency; over a Dataset; reviewed in Data Reviews |
| Data Review | One person's review of a listing or of a patient's data for a period, recording what they checked and what they found | Status: assigned, in progress, completed. Exits: not done (with the reason) | Period, reviewer; of a Data Review Listing or a Patient; raises Data Queries and Findings; signed by the reviewer |
| Alert | A notice that something crossed a line: a surveillance rule fired, a KRI turned amber or red, a QTL was approached or exceeded, a statistical test flagged a site | Status: raised, acknowledged, investigating, closed. Exits: dismissed (as not relevant, with the reason) | Severity, raised on; raised by a Surveillance Rule, a KRI Measurement, a QTL Measurement or a Statistical Finding; about a Study, Site, Patient or Data Record; leads to a Finding or an Issue |
| Finding | Something wrong or unusual that a person has confirmed, from an alert, a review, a monitoring visit or an audit trail review | Status: open, assessed, actioned, closed. Exits: not confirmed | Description, impact on patient safety or data reliability, critical-to-quality factor affected; from an Alert, a Data Review, a Monitoring Visit or an Audit Trail Review; leads to an Issue, a Data Query or a Protocol Deviation |

---

## 8. Statistical monitoring

Central statistical monitoring compares sites, and patients within them, across many variables at once, to find patterns that one record cannot show: fabrication, misunderstanding of the protocol, sloppy measurement or under-reporting.

| Type | What it is | State dimensions | Key properties and links |
|---|---|---|---|
| Statistical Test Definition | A test the monitoring runs, such as distribution of a variable by site, variance, digit preference, rounding, inliers, correlation between variables, event reporting rate or visit timing | Status: draft, validated, in use, retired | Method, variables, level (site, country, patient), significance threshold; part of a Statistical Monitoring Plan |
| Statistical Monitoring Plan | Which tests run on which data, how often, and how results are scored and escalated, for one study | Status: draft, approved, in effect, superseded | Version, frequency; for a Study; has Statistical Test Definitions; part of the Monitoring Plan |
| Statistical Monitoring Run | One run of the plan on one data cut, a background run (platform spec 3.4) | Status: queued, running, completed. Exits: failed | Data cut; run of a Statistical Monitoring Plan; reads Dataset Versions; produces Site Scores and Statistical Findings |
| Site Score | One site's overall result in a run: a data inconsistency score combining its test results, and its rank among sites | Level (classifying): low, medium, high | Score, rank, tests contributing; for a Site; produced by a Statistical Monitoring Run |
| Statistical Finding | One flagged result: a site, country or patient whose data stands out on a test, with how strongly | Status: flagged, under review, explained, escalated. Exits: dismissed (as a known cause, such as a site's population) | Test, p-value or score, direction; produced by a Statistical Monitoring Run; about a Site or a Patient; raises an Alert |

---

## 9. Key risk indicators

A key risk indicator measures something about how a study is running that predicts a risk to patients or to the reliability of its results, compared across sites against thresholds.

| Type | What it is | State dimensions | Key properties and links |
|---|---|---|---|
| Key Risk Indicator | A defined measure, such as adverse events per patient-visit, query rate, data entry lag, screen failure rate, early discontinuation rate or protocol deviations per patient, with its thresholds | Status: draft, approved, active, retired | Numerator, denominator, level (site, country, study), unit, direction (higher is worse or better), amber and red thresholds, minimum denominator before it counts; mitigates a Risk; part of the Monitoring Plan |
| KRI Measurement | A key risk indicator's value for one site, country or study at one point in time | Rating (classifying): green, amber, red, not enough data | Value, numerator, denominator, as of; of a Key Risk Indicator; for a Site, a country or a Study; from a Dataset Version; raises an Alert when it turns amber or red |

Metrics on Home (platform spec 5.1) count these directly, such as "Sites with a red KRI".

---

## 10. Quality tolerance limits

A quality tolerance limit is a study-level limit on a parameter that, if crossed, signals a systematic problem that could affect patient safety or the reliability of the results. ICH E6(R3) asks that limits be set for critical-to-quality factors, that crossing one be investigated, and that it be reported in the clinical study report.

| Type | What it is | State dimensions | Key properties and links |
|---|---|---|---|
| Quality Tolerance Limit | A limit on a study-level parameter, such as the proportion of patients who discontinue early, who miss the primary endpoint assessment or who receive a prohibited medication, with a warning limit before it | Status: draft, approved, active, retired | Parameter, limit, warning limit, rationale, unit; protects a Critical-to-Quality Factor; for a Study; part of the Monitoring Plan |
| QTL Measurement | A quality tolerance limit's parameter as measured at one point | Rating (classifying): within, warning, exceeded | Value, as of; of a Quality Tolerance Limit; from a Dataset Version; raises an Alert at warning or exceeded |
| QTL Deviation | A quality tolerance limit that was exceeded, with its investigation, root cause, actions and how it is reported | Status: opened, investigating, actions taken, closed | Root cause, impact assessment, reported in the clinical study report; of a Quality Tolerance Limit; raised from a QTL Measurement; leads to an Issue or a CAPA |

---

## 11. Risk-based quality management

How a sponsor decides what matters most in a study, what could go wrong with it, and how much of what monitoring to do about it (ICH E6(R3), quality by design and risk-based quality management).

| Type | What it is | State dimensions | Key properties and links |
|---|---|---|---|
| Critical-to-Quality Factor | Something a study must get right for patients to be protected and its results to be reliable, such as eligibility, informed consent, the primary endpoint's assessment or investigational product handling. ICH E8(R1) | Status: proposed, agreed, retired | Description, why it is critical; for a Study or a Protocol; protected by Risks' controls, KRIs and QTLs |
| Risk | Something that could go wrong with a critical-to-quality factor, with how likely it is, how bad it would be and how easily it would be detected | Status: identified, assessed, controlled, closed. Exits: accepted (with the rationale) | Description, category, likelihood, impact, detectability, score, owner; threatens a Critical-to-Quality Factor; part of a Risk Assessment; controlled by Risk Controls; indicated by KRIs |
| Risk Assessment | A study's assessment of its risks at one time, such as at protocol finalization and after each amendment, in the manner of TransCelerate's RACT | Status: draft, in review, approved, superseded | Version, date; for a Study; holds Risks; drives the Monitoring Plan |
| Risk Control | What reduces a risk: a protocol simplification, training, an edit check, a surveillance rule, a KRI, targeted source data review or an on-site visit | Status: planned, in place, effective. Exits: ineffective (with the evidence) | Kind (classifying): design, training, system check, centralized monitoring, on-site monitoring; controls a Risk; implemented by an Edit Check, Surveillance Rule, KRI or the Monitoring Plan |
| Monitoring Plan | How a study is monitored: the mix of centralized, remote and on-site monitoring, the extent of source data verification and review, and the KRIs, QTLs and statistical tests it uses, for one version of the risk assessment | Status: draft, approved, in effect, superseded | Version; for a Study; follows a Risk Assessment; has KRIs, QTLs, a Statistical Monitoring Plan and Surveillance Rules; source data verification and review levels by data category |
| Monitoring Visit | A monitor's on-site or remote visit to a site, with what was reviewed and found | Status: planned, conducted, report drafted, report approved. Exits: cancelled | Kind (classifying): on-site, remote, triggered; at a Site; by a monitor (Clinical Research Associate); triggered by an Alert where it was; records Findings |
| Issue | A confirmed problem needing action at a site, country or study level, tracked to resolution, with escalation when it does not resolve | Status: open, action planned, in progress, resolved, closed | Severity, owner, due date, escalated to; from Findings; resolved by actions, Protocol Deviations or CAPAs (Safety and Regulatory, Quality Events) |
| Protocol Deviation | A departure from the protocol at a site or for a patient, classified for whether it is important to patients' rights, safety or the results | Status: reported, assessed, closed. Importance (classifying): important, not important | Category, description, date; for a Patient or a Site; under a Protocol; from a Finding or reported by the site; listed in the clinical study report when important |

---

## 12. Audit trails and audit trail review

Every change to every record must be traceable: who made it, when, what it was before and after, and why. The platform already records this for every object it holds: each commit is a named graph with its provenance, kept in an append-only, hash-chained journal (platform spec 3.4). The objects below represent audit trails as data, so they can also be read from other systems, such as an EDC or a laboratory system, and so their review, which regulators expect to be planned, risk-based and documented, is work the platform can carry.

| Type | What it is | State dimensions | Key properties and links |
|---|---|---|---|
| Audit Trail | The record of changes kept by one computerized system for one study, where it is held and how it can be read | Status: active, closed, archived | System, format, retention; for a Data Source or a Data Store; holds Audit Trail Entries |
| Audit Trail Entry | One recorded action on one record: who did it, in which role, when, on which record and field, the value before and after, and the reason given. Never changed once written | Action (classifying): created, changed, deleted, viewed, signed, exported | Timestamp, user, role, old value, new value, reason; part of an Audit Trail; about a Data Record, Form Instance or other object. For objects the platform holds, these are its commits |
| System Access Event | A sign-in, a failed sign-in, a change of a person's access or a change to the system's configuration | Kind (classifying): sign-in, failed sign-in, access change, configuration change | Timestamp, user, system, detail; part of an Audit Trail |
| Audit Trail Review Plan | What audit trails are reviewed, by whom, how often and looking for what, chosen by risk: the critical data and the changes that matter most | Status: draft, approved, in effect, superseded | Version; for a Study; scope (systems, data, events), frequency, review criteria; follows the Risk Assessment; part of the Monitoring Plan or the data management plan |
| Audit Trail Review | One review, by one person, of an audit trail's entries for a scope and a period, to the plan's criteria | Status: scheduled, in progress, completed, closed. Exits: not done (with the reason) | Period, scope, reviewer, date; under an Audit Trail Review Plan; reads Audit Trail Entries; records Audit Trail Review Findings; signed by the reviewer |
| Audit Trail Review Finding | Something an audit trail review found that needs explaining, such as data changed after it was verified or locked, values entered long after the visit, many changes by one user, deletions, changes with no reason, entries made outside working hours or access by someone who should not have it | Status: open, explained, actioned, closed. Exits: not confirmed | Pattern, entries concerned, explanation; recorded by an Audit Trail Review; may lead to a Data Query, an Issue, a Protocol Deviation or a Quality Event |

---

## 13. Lifecycles, states and the platform's rules

- **Lifecycles stay short.** Every lifecycle above has at most five stages on its main path, as the design system's chart ramp allows. Ways out, such as rejected, failed, dismissed or not done, are **exits** off the main path (platform spec 3.1), each with the reason as a property, so an object's journey shows where it left.
- **Classifying states** (marked "classifying") are chosen when an object is created and corrected by editing, never moved by a method: a data source's kind, a dataset's stage, a KRI measurement's rating.
- **Definitions and their results are separate objects.** A KRI, a QTL, a statistical test or a surveillance rule is a definition, approved and versioned; its measurements, findings and alerts are results, each recording the definition's version and the dataset version it was computed from.
- **Runs are background runs.** Transformation runs, validation runs and statistical monitoring runs are started by a commit and finished by a worker (platform spec 3.4), and record their lineage.
- **Everything that changes data is a commit.** Edits, query answers, locks and unlocks go through the gateway's commit sequence, with signatures where the method requires one, so the audit trail of objects the platform holds needs no separate mechanism.

---

## 14. Who works with them

These would join the canonical roles of `domain-life-sciences.md` (section 6). The Clinical Data Manager, Clinical Research Associate and Biostatistician already exist there.

| Persona | Works mainly with |
|---|---|
| Clinical Data Manager | Data collection specifications, edit checks, data queries, data reviews, coding, reconciliations, data transfers, database lock |
| Clinical Programmer | Dataset specifications, mapping specifications, derivation rules, transformations, validation runs and findings |
| Central Monitor | Surveillance rules, alerts, KRI and QTL measurements, statistical monitoring runs and findings, findings and issues |
| Risk Manager (RBQM lead) | Critical-to-quality factors, risks, risk assessments, risk controls, the monitoring plan, KRIs and QTLs, QTL deviations |
| Clinical Research Associate | Monitoring visits, findings, data queries, protocol deviations |
| Quality Assurance Auditor | Audit trail review plans, audit trail reviews and their findings, system access events, CAPAs |
| Data Steward | Data stores, access groups, retention policies, archive packages |

Home metrics that would follow from these objects: open alerts by severity, sites with a red KRI, QTLs at warning or exceeded, open issues past their due date, audit trail reviews overdue, data transfers rejected, and forms not entered within the agreed lag.

---

## 15. Open questions

- **Settled in 0.2:** values are held as rows of dataset versions, read through an adapter; measures, bindings and expectations are in the graph; only values someone must act on become data points (platform spec 3.2). Whether Data Record itself becomes a data point is open in the life sciences domain spec.
- Where should audit trail entries from other systems live: imported into the graph, or read through an adapter at the gateway (platform spec 7, Integration) and only their review held here?
- Should Alert and Finding be shared with Safety and Regulatory's Signal and Quality Events' Quality Event through one annotation model, the open question in `domain-life-sciences.md` section 12?
- Are KRI and QTL thresholds metrics in the platform's sense (platform spec 5.1, Home), so that one declaration serves both the monitoring and the Home tiles?
- Which data managers' and monitors' know-how should be skills (platform spec 3.3), such as proposing a query's text from a failed check or recommending which sites to visit next from KRIs and statistical findings?
- How are blinded and unblinded datasets kept apart in one graph, beyond the rules that hide an arm today?
- Which personas own which of these types for structure changes (platform spec 3.7)?

---

## 16. Version Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-24 | First draft: the objects of a clinical data management system, from data design and capture to datasets, transformations, storage, surveillance and alerts, statistical monitoring, KRIs, QTLs, risk-based quality management, and audit trails and their review, extending the Clinical Development domain. Proposed, not built. |
| 0.2 | 2026-11-24 | Values live in datasets, not the graph: measures as shapes, measure bindings and data points as references, built at the platform level (platform spec 0.43), with Blood Pressure in the life sciences domain. The first open question is settled. |
