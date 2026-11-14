# Ontology-Driven AI Platform: Prompt Specification

Version 0.24. November 14, 2026. Author: Paul Chang.

This is a living prompt. It drives the development of the platform. The spec leads and the code follows: every change starts here and is then built. When the platform falls short, the gap is closed in the spec first, then in the code. The spec is the asset.

This spec stays abstract on purpose. It defines the pattern, not a domain. Concrete domains are applied to it through domain specs.

---

## 1. The Prompt

You are building an AI platform for production use. The platform has no hardcoded screens, menus or workflows. Everything a person sees and does is derived from an underlying model: an ontology and a knowledge graph. Agents read that model. Agents act on it. Agents compose the interface a person needs, at the moment they need it.

Most of the effort goes into the model. The interface is a consequence of the model.

Build the platform so that a new domain can be added by supplying a new ontology and knowledge graph, with no new UI code.

---

## 2. Principles

1. **The ontology is the product.** Objects, relationships, states and methods are defined once. Navigation, search, actions and UI are all generated from them.
2. **Structure first, intelligence second.** Agents are only as good as the structures they act on. Rich structure lets agents handle edge cases without special code.
3. **Intent over interface.** People declare what they want. The platform works out how to get them there.
4. **Every object is addressable.** Anything a person can see, an agent can find, read and act on through the same contract.
5. **Context shapes everything.** Who the person is, what the business needs and what is happening now all change what the platform shows and suggests.
6. **Open by default.** The platform is interoperable inside and out. External agents and platforms connect through the same ontology.
7. **Predictable and accountable.** Every change is explainable, reversible where possible and logged.

---

## 3. Architecture

The platform is organized in layers. Each layer depends only on the layers below it.

### 3.1 Ontology Layer
Defines what exists in a domain.

- **Object types.** Each has an identity, properties and a lifecycle.
- **Relationships.** Typed links between objects.
- **Methods.** Operations an object supports. Each method declares what it needs, what must be true before it runs and what it changes.
- **State.** An object occupies a position in its own state space. That space can have any number of dimensions, defined by the domain. A method acts on an object by moving it from one position to another.

This follows an object-oriented paradigm. Objects carry their own properties and behaviors. The ontology is domain-agnostic in format. One schema describes any domain.

#### How the ontology is expressed

The ontology is written in **RDF 1.2 with SHACL**, in Turtle files under `ontology/`.

| Concept | Expressed as |
|---|---|
| Object type | An RDF class with a named SHACL node shape |
| Property | A named SHACL property shape |
| State dimension | A property whose values come from a SKOS concept scheme |
| Relationship | An RDF property whose shape names the target class. It also declares how it reads from the other end (its inverse label, such as "enrolled in" and "enrolls"), whether one end is part of the other (containment), and, where the domain is certain, that an object links to at most one object along it |
| Method | A resource in the platform vocabulary, with its inputs, precondition and effects |
| Precondition | A SHACL shape the object must conform to. Its messages explain a block |
| Effect | State changes and new objects, declared in the platform vocabulary and applied by the gateway in one transaction |
| Drafting | A value a connected model drafts and a person accepts, declared with the property it fills, the model's instructions and the linked objects it may draw on (section 3.4, Generated drafts) |
| Title | How a type names its objects for people: one or more templates over the object's properties, coded values and links, declared with the type. The first template whose values are all present is used, so new objects are titled without anyone naming them. A title may use only what no role or rule hides. The identifier stays the stable reference |
| Analysis | Background work the platform computes, such as a disproportionality analysis, declared in the platform vocabulary with its parameters (section 3.4, Background runs) |
| Business rule | A resource in the platform vocabulary with its parameters, enforced by SHACL shapes or by the gateway |
| Role | A resource in the platform vocabulary naming the methods it may run and what it may not read |
| Terminology | SKOS concepts mapped to external vocabularies with `skos:exactMatch` or `skos:closeMatch` |

The platform vocabulary (`ontology/platform.ttl`) adds what SHACL does not describe: methods, inputs, effects, business rules and roles. It is domain-free.

Modeling rules:

- **SHACL is the contract.** Every class has a named node shape, and all data is validated against its shapes.
- **Named, not anonymous.** Shapes and other resources have URIs; no blank nodes, except RDF lists.
- **Progressive rigidity.** No closed shapes, and cardinality only where the domain is certain, so the model grows without breaking.
- **Logic in SHACL, not OWL.** SHACL Core and SPARQL constraints now; SHACL 1.2 Rules once tooling supports them.
- **Ground in terminologies.** Map to established vocabularies; mint new terms only when none fits. Every mapping is checked against its source.
- **Reuse W3C standards first:** RDF, RDFS, SKOS, SHACL, PROV-O, Time, DCAT, then Schema.org and Dublin Core, then industry standards.
- **Provenance.** Each commit is a named graph with PROV-O provenance. Statement-level provenance uses RDF 1.2 reifiers.
- **Additive evolution.** Each ontology carries a semantic version. Published terms keep their meaning; they are deprecated, never deleted, and point to their replacement.

Runtime: the gateway holds the graph in **Oxigraph** and validates with a JavaScript SHACL engine.

Namespace: every term lives under **`https://w3id.org/lsh-platform/`**, a permanent identifier from the w3id.org redirection service, so term addresses survive any change of host or repository. Each ontology has its own path, such as `https://w3id.org/lsh-platform/platform#` and `https://w3id.org/lsh-platform/life-sciences#`. The redirect sends software to the Turtle file and people to its documentation.

### 3.2 Knowledge Graph Layer
Holds the instances. The ontology defines types. The knowledge graph holds every actual object, its relationships and its history.

- Supports traversal, similarity and provenance.
- Keeps the history of changes for every object.
- Links objects across domains when they relate.

### 3.3 Context Layer
Holds what the platform knows about the current situation.

- **User context.** Who the person is, what they can do, what they are trying to achieve.
- **Business context.** The rules, priorities and constraints of the organization.
- **Session context.** What is happening right now in the interaction.

Context is queryable by agents and changes what is surfaced, ranked and allowed.

#### Roles and permissions

Agents must know more than the business context and the state of objects. They must know the context of the person they are assisting: what that person does, and what they may do. Real organizations do not fit fixed roles, so the model starts from canonical roles and lets reality vary from them.

- **Permissions are the unit.** A permission allows one thing: running a method, or reading an object type or property. It may be scoped, for example to particular studies or sites. A person's role in their organization is ultimately expressed by the permissions they hold.
- **Canonical roles with smart defaults.** Each domain defines a canonical set of user types, each with a default set of permissions. They are starting points, not fixed boxes.
- **Organizations vary.** Each organization can change what a canonical role grants. The platform records each change as variance from the canonical defaults, as data, so it can be seen, explained and audited.
- **Many hats, or one.** In a small organization one person may hold several roles; in a large, matrixed one, people are specialized. A person can hold any number of roles, plus personal grants and removals. Their effective permissions are the combination. Rules about people, such as separation of duties, apply to the person, not to a role.
- **Both directions.** From roles to permissions: start from the canonical defaults and track the variance. From permissions to roles: given what a person may do, find the canonical roles that match it most closely, and show the difference. This explains a person to agents, and maps people when permissions come from another system.
- **Agents receive the user context.** Every agent request carries the person's roles, effective permissions, variance and scope. Agents use it to decide what to surface and suggest. The gateway still enforces every permission, whatever an agent infers.

The first release implements canonical roles with their default permissions only. Variance, multiple roles and role inference follow.

### 3.4 Intelligence Gateway
The single contract through which anything, human interface or agent, reads and acts on the platform.

- Exposes the ontology, graph and context as machine-readable resources.
- Enforces permissions and policy on every read and every write.
- Speaks open agent protocols so external agents connect as first-class citizens.
- Records every action and its outcome.

#### Gateway contract

Every request carries a **principal**: the person or agent making it and the role they act in. The gateway answers thirteen kinds of request.

| Request | Answer |
|---|---|
| Describe the ontology | Object types, their state dimensions, relationships (read both ways, with containment and cardinality) and methods |
| Find objects | Objects of a type, filtered by state |
| Read an object | Its identifier, title, state, properties and last change, and its relationship ends, as the principal may see them (section 5.1, Within an object) |
| Offer methods | The methods on an object, each available or blocked with its reasons (core loop step 3) |
| Commit a method | Runs one method on one object with its inputs (core loop step 6) |
| Navigation | The domains and object types of the principal's work, with counts (section 5.1) |
| To do | The objects with work waiting for the principal, in order (section 5.1) |
| Compose a method | What the method needs from the principal: each input with its kind, its choices and its default, and the method's archetype (section 5.4) |
| Preview a method | Runs commit steps 1 to 5 without saving, and returns every value that would change, every object that would be created and every described effect that would be recorded as pending work, or the reasons it would fail |
| Track runs | The background runs on objects the principal may read: each run's status and progress, and its outcome once it ends |
| Notifications | The principal's notifications, newest first, with which are unread; and marking them read |
| Search | Objects the principal may read that a text query finds, best first, with how the query was understood and why each object matched (section 5.2) |
| Drafts | A connected model writes a method's draft from what the principal may read, recorded and marked as generated; or a draft is discarded |

**Reads.** A role never sees what it may not read. A rule that hides a property, such as an arm while a study is blinded, hides it from everyone until the rule allows it. Reads of object types marked as personal data are recorded in the audit trail.

**Commits** run as one transaction, in this order, and stop at the first failure with its reasons:

1. The role may run the method.
2. Every input is present, of the right kind, and meets its constraints.
3. The object meets every precondition.
4. The declared effects are applied: state changes, new objects and links.
5. The changed graph is validated against every shape. Any violation undoes the whole commit.
6. The commit is recorded as an activity with PROV-O provenance: who, when, which method, the inputs, and every value changed from old to new. Nothing is overwritten; history is the sequence of commits.

Effects described in words are recorded with the commit as pending work, so nothing is silently skipped.

**Persistence.** The graph's state survives restarts. The source of truth is an append-only **journal** on disk:

- Every commit and every recorded read is written to the journal, and flushed to disk, before the gateway answers. A request the gateway answered is never lost.
- Each entry holds exactly what changed: the statements removed and added, including the commit's own provenance record.
- Each entry carries a SHA-256 fingerprint of itself and of the entry before it. Changing, removing or reordering any past entry breaks the chain, and the gateway refuses to start until the journal is restored. This makes the audit trail tamper-evident.
- The journal's first entry fingerprints the seed graph it builds on. The gateway refuses to replay a journal onto a different seed.
- On start, the gateway loads the ontology and seed, checks the chain, and replays every entry.
- Commits run one at a time, on a working copy of the graph. Readers never see a commit that has not finished, and two commits never interleave.

A database server can later hold the current state for larger data or several gateways. The journal stays as the audit record.

**Electronic signatures.** A method that requires a signature commits only with one, and the signature is part of the commit.

- The signer is the principal: a person, never an agent. Any person input of a signed method is the principal; nobody signs for someone else.
- The signature records the signer's name, the date and time of signing, and the meaning of the signature, such as approval or authorship. The meaning comes from the method in the ontology. All three are bound to the commit's provenance record, so they cannot be separated from what was signed.
- Signing authenticates the person at the moment of signing, through the identity provider. Until one is connected, development mode accepts the person typing their full name, and the signature is recorded as a development signature that is not a valid electronic signature. Outside development mode, the gateway refuses to sign.

**Background runs.** A method that runs in the background, such as a computation over many objects, is started by a commit and finished by a worker.

- **Starting** is an ordinary commit, steps 1 to 6, so it is checked, previewed and recorded like any other. The commit also creates a **run**: a PROV-O activity recording the method, the object, who started it, in which role, and when.
- **Workers.** The work itself is an **analysis** the method declares in the ontology, with its parameters (section 3.1). The platform implements each kind of analysis once, for every domain. A method whose background work no worker can do yet, such as a model nobody has connected, is refused before step 1 with that reason. The platform never pretends to run it.
- **Status.** A run is queued, then running, then succeeded or failed. Its progress, as a fraction, is reported while it runs and not kept. Status changes are written to the journal.
- **Results.** A worker reads and writes the graph only through the gateway, as the platform's background worker, acting on behalf of the person who started the run. Its result is a commit like any other: validated against every shape, recorded with PROV-O provenance, and refused whole if any shape fails, which fails the run with the reasons. The result and the run's end are written in one journal entry, so a result is never applied twice.
- **Restarts.** A run that had not ended when the gateway stopped starts again when the gateway restarts.
- **Notifications.** When a run ends, the person who started it is notified: what ran, on which object, and what it found or why it failed. A notification belongs to its recipient; nobody else sees it. Notifications and their read state are kept in the graph and the journal.

**Generated drafts.** A method that produces a draft, such as a case narrative, declares a **drafting** effect: the property the accepted text fills, the instructions for the model, and the linked objects the model may draw on. The instructions are part of the ontology, so they are versioned and reviewed with it.

- **Connected models.** The gateway drafts only with a model the deployment connects, through a credential held by the deployment, never by the page or the code. Without one, a drafting method is refused with that reason. A method marked as needing a model that declares no drafting effect the platform can run is refused too. The platform never writes a stand-in draft.
- **What the model sees.** Only what the principal may read of the object and its declared links, read through the gateway as the principal. Hidden properties stay hidden, unreadable types are left out, and reads of personal data are recorded in the audit trail as the principal's. Records reach the model as data, apart from its instructions, and nothing in a record is followed as an instruction.
- **The draft is recorded before it is shown.** The record holds the method, the object, who asked and in which role, the model that wrote it as the provider reports it, SHA-256 fingerprints of the instructions and of the records given, the objects given, the time and the text. A draft changes nothing on the object.
- **A person decides.** Accepting commits the method with the draft's text or the person's edit of it. The commit records which draft it came from and whether it was edited, and the person who accepted it is accountable for the text. Discarding records that the draft was discarded. A draft is decided once. Agents may ask for drafts; only a person accepts or discards one.
- **Failures.** When the model declines or cannot be reached, the reasons are returned and nothing is recorded.

**Transport.** The gateway serves JSON over HTTP for the experience layer, and the Model Context Protocol for agents. Both use the same contract.

**Previews.** For reviewing the experience on any device without a server, the same gateway code can run inside the page, with the seed graph, in development mode and without a journal. Nothing a preview does is saved.

**Identity.** Until an identity provider is connected, a development mode accepts the principal from request headers. Outside development mode, the gateway refuses requests it cannot authenticate.

### 3.5 Agent Layer
Agents do the work. The roles below are illustrative. The platform may split or combine them.

- **Orchestrate.** Interpret intent, plan steps, delegate.
- **Navigate.** Build the navigation structure from the ontology and context.
- **Find.** Search the graph and return the right object.
- **Act.** Select and execute methods, check preconditions, handle failures.
- **Compose.** Generate the UI needed for the current step.
- **Guard.** Check every proposed change against policy and explain blocks.

Agents never bypass the gateway.

### 3.6 Experience Layer
What a person sees. Generated, not designed screen by screen.

- Built from a design system that is itself machine-readable, so agents can assemble it.
- Chat is one mode among many. The platform picks the right mode for the task.
- The design system and its machine-readable catalog are defined in `design-system.md`.

---

## 4. The Core Loop

Every interaction follows the same loop. The platform supports it end to end, for every object type in every domain.

1. **Orient.** The platform shows a navigation structure derived from the ontology, shaped by context. It proposes logical starting points.
2. **Find.** The person searches or browses. The platform resolves the request against the graph and returns the object.
3. **Choose.** The platform shows the methods available on that object, given its state and the person's context.
4. **Declare.** The person says what outcome they want. They can pick a method or describe the outcome in their own words.
5. **Compose.** The platform generates the UI needed to get from the current state to the target state.
6. **Commit.** The change is validated, executed, recorded and explained.
7. **Continue.** The platform suggests what is likely next, based on the new state.

---

## 5. Component Requirements

### 5.1 Ontology-Driven Navigation
- Generated from object types and relationships, not a sitemap.
- Adapts to user and business context.
- Offers multiple views of the same graph.
- Surfaces proactive starting points.
- **Each person sees the object world of their work.** Navigation lists the object types of the domains their roles work in, grouped by domain, limited to what they may read. A clinical role does not see discovery or safety navigation. Objects outside that world stay reachable through links and search when the person may read them.

#### To do

Orient opens on **To do**: the objects where the person has work waiting, as cards. It is generated from the ontology, not designed per role.

- An object is on the list when the person can run a **task** on it now: a method whose preconditions hold and that their role may run. Methods marked **on demand**, such as running a simulation, are actions a person chooses to take; they do not put an object on the list.
- An **urgent** object is on the list when the person can run any method on it. State values carry an urgency in the ontology, such as high deviation risk or a serious case.
- The list is ordered by the nearest deadline, then by urgency. Date properties marked as deadlines in the ontology give the deadlines.
- Each card shows the object, its state, its deadline and the tasks waiting.
- **A summary leads the list**, so the person sees the shape of their work before its parts. It is computed from the same items, never designed per role: how many items are waiting, urgent, due within 7 days and overdue. Choosing a count narrows the list to those items.
- **Lifecycle stage.** Each object type's state dimensions are ordered in the ontology; the first is its lifecycle, such as a case's workflow or a submission's status, and its values are ordered too, so an object's stage reads as a step along the way, such as "stage 3 of 5", in every domain.

#### Within an object

Every object opens on its own, from wherever it appears: a card, a link, a search result. What it shows is generated from the ontology, the same way for every type in every domain, never designed per type.

- **Header.** The object's identifier, type and title, its state, its deadline and urgency, and the methods the person can run on it now.
- **Relationship ends.** For each relationship its type has in the ontology, in either direction, the object has an end: what the relationship reads as from this object (such as "enrolls" for a study's patients), whether it contains the objects at the other end, is part of them, or is only related, and whether it holds at most one object or many. Ends that reach a type the person may not read are left out.
- **Overview first.** The object's properties; the ends that hold at most one object, as links, the objects it is part of first; and its last change: the method, who ran it and when.
- **Then the many-valued ends.** One section per end, in order: the objects it contains first, then related objects, in the ontology's order. Each section shows its count and lists its objects as cards, with the methods the person can run on each. Empty sections are shown too, so every object of a type has the same structure.
- **Names.** An end is named by the type at the other end, such as Patients. When two ends of one object reach the same type, or an end reaches the object's own type, it is named by how its relationship reads instead, such as "Duplicate of".
- **Moving through the graph.** Opening a related object from inside another keeps the way back, one step at a time.
- Reading an object is a read like any other: permissions apply, hidden properties stay hidden, and reads of personal data are audited.

### 5.2 AI Search
- Accepts natural language and structured queries.
- Understands the ontology: types, properties, relationships and their meaning.
- Resolves ambiguity by asking, not guessing.
- Returns objects, not documents. Each result is actionable.

**How a query is understood.** The gateway reads a query against the ontology, so search works the same in every domain without designing it per domain:

- **Identifiers.** A word that is an object's identifier, such as SC-003, finds that object first. With an object type in the query, it finds the objects of that type linked to it, either way, such as "cases for P-101".
- **Object types.** A type's name, singular or plural, or the last word of it, such as "cases" for Safety Cases, narrows the search to that type. A word that fits several types, such as "event", keeps all of them.
- **States.** A value of a type's state dimension, such as "serious" or "open", narrows to objects in that state. The longest value that fits is taken, so "non-serious" is never read as "serious".
- **"My" and "mine"** narrow to the principal's own objects: those with work waiting for them on To do, and those that name them in a person property, such as a submission they prepared.
- **Any other words** must each appear in what the principal may read of the object: its identifier, its state, its properties and the identifiers it links to.
- The answer says how the query was understood, as the types, states, links and words it used, so the person can see why each object matched and correct the query. Results come best first: an identifier match, then objects that meet what was understood, then text matches.
- **Permissions as in a read.** Search never matches what the principal may not read, such as a hidden property or an unreadable type. A result whose personal data matched the query is a read of that data, and is recorded in the audit trail as one.
**Understanding with a connected model.** Where the deployment connects a model, the gateway asks it to understand the query, so a person can ask in their own words, such as "list all of my queries" or "anything serious from the Lakeside site":

- The model turns the query into a **search plan** of the same parts: types, states, identifiers, words and whether the person means their own objects. It is given only the vocabulary the principal may read (type names, state values and relationship names), the identifiers the principal may read that the query mentions, and the principal's name and role. **It is never given a record.**
- The gateway checks every part of the plan against that vocabulary, drops whatever is not in it, and runs the plan exactly as it runs one read from the ontology: the same permissions, ranking and audit.
- Without a connected model, or when the model fails or declines, the gateway reads the query against the ontology instead. The answer always says which it was, and for a model, which model.
- Suggestions while the person types come from the ontology reading alone, so the model is asked once per search, not once per keystroke.

### 5.3 Method Engine
- Offers only methods valid for the object's current state and the person's context.
- Accepts a chosen method or a declared outcome, and maps outcomes to methods.
- Previews the effect of a change before commit.
- Acts on one object or many.

### 5.4 Generated UI
- Assembles the interface from design system components at runtime.
- Each generated view has one job: move the object from its current state to the target state.
- Consistent and predictable. The same task produces the same UI shape.
- Can explain why it shows what it shows.

#### Running a method: interaction archetypes

In regulated work such as healthcare and clinical trials, the experience must be **predictable and repeatable**. The context and content change; the patterns do not. The platform follows the declarative model of A2UI (Google's Agent-to-User Interface): the experience is described as data, drawn only from a closed catalog of components, with the data bound separately. No interface is generated free-form.

Running a method always follows the same sequence:

1. **Select** an object.
2. **Run** one of its methods.
3. **Collect** the context the method needs: its inputs, and what the person must see to decide.
4. **Assemble** the method's interaction from its archetype.
5. **Traverse** the interaction until it is complete or the person cancels.
6. **Show** what changed on the object: a preview before commit, then the outcome.
7. **Return** to where the person came from, ready for the next thing.

Every method has exactly one **interaction archetype**, derived from what the ontology says about it. The rules are checked in this order, and the first that matches decides:

| Archetype | When | What the person does |
|---|---|---|
| Review and sign | The method requires an electronic signature | Review what will be signed, then sign with its meaning |
| Start and track | The method runs in the background | Start it, then follow its progress and get notified when it ends |
| Compare and decide | An input is another object of the same type | See both objects side by side, then decide |
| Review a draft | The method produces a draft | Read the generated draft, marked as such, then accept, edit or discard it |
| Choose an object | An input is an object of another type | Pick it from a list of the objects that qualify |
| Step by step | The method needs five or more inputs | Give them in steps, one group at a time |
| Fill in | The method has inputs | Fill in a short form |
| Confirm | The method has no inputs | Confirm the change |

- Deriving the archetype by rule means a new domain gets its interactions without designing them method by method. A method may override its archetype in the ontology when a rule gives the wrong one; overrides are recorded and rare.
- Each archetype has one pattern in the design system (design system spec 5.1). The same archetype always looks and behaves the same way.
- Every archetype ends the same way: a preview of each value that will change and each object that will be created, the commit, and the outcome. A blocked commit shows the gateway's reasons.
- **Acting on many objects** is a mode, not an archetype: the person selects several objects, then runs the method's archetype once for all of them.
  - The methods offered are those every selected object has available to the person now.
  - For now, only Confirm and Fill in run for many. A signature, a draft, a comparison and a background run each stay with one object at a time.
  - The inputs are given once. Each object is previewed and committed in its own commit, so each is checked, recorded and atomic on its own. An object whose preview is refused is named with the gateway's reasons and left out, never skipped silently.
  - The outcome names every object: what changed, and what was refused and why.
- Agents use AI to fill the pattern, never to choose it: the wording, sensible defaults, the context worth showing, and the explanation of a block.
- **Several at once.** A person can set a method they are running aside and come back to it: the process is minimized, keeping everything given so far, and another can be started. One process is in front at a time; restoring one sets the one in front aside. Each set-aside process shows how far along it is, in terms of its archetype, so the measure is the same for every method of that archetype. Nothing is committed until the person finishes the process.
- **Choices come from the ontology.** A value from a concept scheme offers the scheme's values, narrowed by the input's shape. A person offers the people who may act. An object offers the objects that qualify. A person input defaults to the principal.

### 5.5 Interoperability
- **Internal.** Any agent inside the platform can act on any object through the gateway.
- **External.** Outside agents and platforms connect through the same gateway.
- **Federated.** Platforms built on this pattern can link their graphs and act across each other. This is the path to infinite connections between platforms and worlds.

---

## 6. First Release Scope

The first release proves the pattern on real work, built to the quality requirements in section 7. Later releases add domains, not new UI code.

- More than one domain, to prove the platform is domain-independent.
- At least one link across domains.
- More than one persona, to show context-driven adaptation.
- Journeys that run the full core loop, including an edge case the agents resolve without special code.
- An external agent completing a task through the gateway.
- A way to inspect the ontology, graph, method and policy behind any view.

Specific domains, personas and journeys are defined in domain specs.

---

## 7. Quality Requirements

The platform meets these from the first release. Domain specs add the obligations of their industry.

- **Security.** Every person and agent has an authenticated identity. Permissions are least-privilege and enforced at the gateway. Data is encrypted in transit and at rest. Secrets never live in code.
- **Accountability.** An append-only audit trail records every change and every read of protected data: who, what, when, why and under which policy. Methods that need a signature capture one, bound to the record.
- **Data integrity.** History is never overwritten. A correction is a new record linked to what it corrects.
- **Integration.** Systems of record connect through adapters at the gateway. An adapter maps an external system's records to the ontology, so agents see one graph whether an object is held by the platform or federated from another system.
- **Reliability.** Every commit is atomic. A failed method leaves the object in its prior state and explains why.
- **Performance and scale.** Each release sets targets and measures against them from the first build.
- **Accessibility.** Generated UI meets WCAG 2.2 AA.
- **Responsive.** Every view works at every screen size, from a small phone (320 CSS pixels wide) to a wide desktop, with no horizontal page scrolling. Nothing is desktop-only.
- **Testing.** Every method, policy rule and pattern selection rule has automated tests. Generated views are tested for consistency (the same task produces the same UI shape) and accessibility.
- **Change control.** The ontology, methods, policies and design system catalog are versioned. Changes to them are reviewed, tested and traceable, so the platform can be formally validated where a domain requires it.

---

## 8. Acceptance Criteria

The first release is accepted when:

1. Adding a new domain requires only a new ontology, its methods and policies, and a seed graph or an adapter.
2. The same object adapts to different personas, for reasons the platform can explain.
3. A person can reach and act on any object by declaring intent.
4. An external agent completes a task without any UI.
5. Every change is traceable from intent to outcome.
6. The quality requirements in section 7 and the obligations of each applied domain spec are met.

---

## 9. Open Questions

To resolve in future versions of this spec.

- How are methods authored and versioned? Who owns them?
- How much autonomy do agents get before they must ask a human?
- How does the platform resolve conflicting context?
- What is the trust model for external agents and federated platforms?
- How is the generated UI tested for consistency and accessibility at scale?
- Should the view spec adopt A2UI's message format, such as surfaces and data model updates, for multi-step interactions, or stay our own format following A2UI's model?
- Do irreversible methods, such as locking a study, need a distinct variant of their archetype?
- Which identity provider authenticates people and agents, and how does it authenticate a person at the moment of signing?
- How are background runs scheduled, as well as started by a person, and who is notified of a scheduled run's outcome?
- Should workers run outside the gateway process, so long computations never delay commits?
- How is a drafting model validated for its intended use, and how are its instructions changed under change control?
- Where may a drafting model process records: which providers, regions and retention terms satisfy each domain's privacy obligations?
- Should a draft expire, or be refused on acceptance, when its object has changed since it was written?
- Which model should understand search, given that a person waits for it: the platform's default model, or a faster one?
- How should search read dates and deadlines, such as "overdue" or "due this week", which depend on an object's state as well as its date?
- Who in an organization may change permissions and role defaults, and how is that change approved and audited?
- How is a match between a person's permissions and a canonical role measured, and how close is close enough to suggest the role?
- How are permissions scoped: by study, site, product, region, or other objects in the graph?
- When does replaying the journal become slow enough to need snapshots, and how do snapshots work across ontology versions?
- What are the deployment model and hosting targets?
- What are the performance and scale targets for the first release?
- May one signature cover many records at once, and how would each record carry it, so methods that need a signature can run for many?
- Should a run for many objects be one transaction, all or nothing, where a domain needs it?

---

## 10. Version Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-07 | First draft from freeform brief. |
| 0.2 | 2026-11-07 | Abstracted state to n-dimensional spaces. Removed domain examples and fixed counts. Agent roles marked illustrative. |
| 0.3 | 2026-11-08 | Linked the design system spec from section 3.6. |
| 0.4 | 2026-11-08 | Reframed from a demo to platform development: the spec leads production code. Replaced Demo Scope and Non-Goals with First Release Scope and Quality Requirements. Added acceptance criterion 6 and open questions on deployment and performance targets. |
| 0.5 | 2026-11-08 | Added the responsive requirement to section 7. |
| 0.6 | 2026-11-08 | Answered how the ontology is expressed (section 3.1): RDF 1.2 with SHACL, a platform vocabulary, modeling rules and the runtime. Chose the namespace, `https://w3id.org/lsh/`. |
| 0.7 | 2026-11-09 | Renamed the namespace to `https://w3id.org/lsh-platform/` before registration, because w3id.org declines short, generic names. |
| 0.8 | 2026-11-09 | Added the gateway contract (section 3.4): principals, five requests, read filtering, the commit sequence, provenance, transport and identity. Two open questions on identity and persistence. |
| 0.9 | 2026-11-09 | Added Roles and permissions to the context layer (section 3.3): permissions as the unit, canonical roles with smart defaults, organizational variance, people with many roles, role inference from permissions, and user context for agents. Three open questions. |
| 0.10 | 2026-11-09 | Added Persistence to the gateway contract (section 3.4): an append-only, fingerprinted journal written before every answer, replayed on start; commits one at a time on a working copy. Replaced the persistence question with one on snapshots. |
| 0.11 | 2026-11-09 | Navigation shows each person the object world of their work (section 5.1). Added To do: tasks, on-demand methods, urgency and deadlines. The gateway answers Navigation and To do requests. |
| 0.12 | 2026-11-09 | Previews may run the gateway inside the page, with the seed graph and nothing saved (section 3.4). |
| 0.13 | 2026-11-11 | Added interaction archetypes (section 5.4): predictable, repeatable patterns on the A2UI declarative model; the seven-step sequence for running a method; eight archetypes derived by ordered rules; acting on many objects as a mode; AI fills patterns but never chooses them. Two open questions. |
| 0.14 | 2026-11-11 | The gateway answers Compose a method and Preview a method (section 3.4). Input choices and defaults come from the ontology (section 5.4). |
| 0.15 | 2026-11-11 | Previews and commits name the described effects they record as pending work. |
| 0.16 | 2026-11-11 | Added electronic signatures to the gateway contract (section 3.4): the principal signs, never an agent; name, time and meaning bound to the commit; development signatures by typed name, clearly not valid, until an identity provider exists. |
| 0.17 | 2026-11-11 | Added background runs to the gateway contract (section 3.4): started by a commit, finished by a platform worker acting through the gateway, results committed and journaled once, restarted after a restart, and the starter notified. Analyses join the ontology's expressions (section 3.1). The gateway answers Track runs and Notifications. Two open questions. |
| 0.18 | 2026-11-12 | Added generated drafts to the gateway contract (section 3.4): drafting effects declared in the ontology, connected models only and never a stand-in, the model sees only what the principal may read, every draft recorded with its model and fingerprints, and a person accepts, edits or discards it. Drafting joins the ontology's expressions (section 3.1). The gateway answers Drafts. Three open questions. |
| 0.19 | 2026-11-12 | To do leads with a summary computed from its items: counts that narrow the list, and work by type and lifecycle stage (section 5.1). State dimensions and their values are ordered, the first being the lifecycle. Several processes at once: set aside, keep what was given, restore one at a time, with progress by archetype (section 5.4). |
| 0.20 | 2026-11-13 | The gateway answers Search (section 3.4). Section 5.2 says how a query is understood against the ontology (identifiers, types, states, links and words), that the understanding is shown, and that search keeps read permissions and audits matches in personal data. One open question. |
| 0.21 | 2026-11-13 | Added titles to the ontology's expressions (section 3.1): templates per type, the first complete one used, never using hidden values. |
| 0.22 | 2026-11-13 | Search understood by a connected model (section 5.2): the model turns a query into a search plan from the vocabulary the principal may read, never a record; the gateway checks and runs the plan, and falls back to the ontology reading. "My" and "mine" mean the principal's own objects. One open question. |
| 0.23 | 2026-11-14 | Relationships read both ways, with containment and cardinality where certain (section 3.1). Added Within an object (section 5.1): every object opens with its header, an overview and one section per many-valued relationship end, contained objects first, generated from the ontology. Read an object answers relationship ends and the last change. |
| 0.24 | 2026-11-14 | The To do summary is its counts only. Acting on many objects (section 5.4): the methods every selected object has available, Confirm and Fill in for now, inputs given once, one commit per object, refused objects named with their reasons. Two open questions. |
