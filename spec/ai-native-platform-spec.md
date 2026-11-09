# Ontology-Driven AI Platform: Prompt Specification

Version 0.8. November 9, 2026. Author: Paul Chang.

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
| Relationship | An RDF property whose shape names the target class |
| Method | A resource in the platform vocabulary, with its inputs, precondition and effects |
| Precondition | A SHACL shape the object must conform to. Its messages explain a block |
| Effect | State changes and new objects, declared in the platform vocabulary and applied by the gateway in one transaction |
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

### 3.4 Intelligence Gateway
The single contract through which anything, human interface or agent, reads and acts on the platform.

- Exposes the ontology, graph and context as machine-readable resources.
- Enforces permissions and policy on every read and every write.
- Speaks open agent protocols so external agents connect as first-class citizens.
- Records every action and its outcome.

#### Gateway contract

Every request carries a **principal**: the person or agent making it and the role they act in. The gateway answers five kinds of request.

| Request | Answer |
|---|---|
| Describe the ontology | Object types, their state dimensions, relationships and methods |
| Find objects | Objects of a type, filtered by state |
| Read an object | Its identifier, state, relationships and properties, as the principal may see them |
| Offer methods | The methods on an object, each available or blocked with its reasons (core loop step 3) |
| Commit a method | Runs one method on one object with its inputs (core loop step 6) |

**Reads.** A role never sees what it may not read. A rule that hides a property, such as an arm while a study is blinded, hides it from everyone until the rule allows it. Reads of object types marked as personal data are recorded in the audit trail.

**Commits** run as one transaction, in this order, and stop at the first failure with its reasons:

1. The role may run the method.
2. Every input is present, of the right kind, and meets its constraints.
3. The object meets every precondition.
4. The declared effects are applied: state changes, new objects and links.
5. The changed graph is validated against every shape. Any violation undoes the whole commit.
6. The commit is recorded as an activity with PROV-O provenance: who, when, which method, the inputs, and every value changed from old to new. Nothing is overwritten; history is the sequence of commits.

Effects described in words are recorded with the commit as pending work, so nothing is silently skipped.

**Transport.** The gateway serves JSON over HTTP for the experience layer, and the Model Context Protocol for agents. Both use the same contract.

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

### 5.2 AI Search
- Accepts natural language and structured queries.
- Understands the ontology: types, properties, relationships and their meaning.
- Resolves ambiguity by asking, not guessing.
- Returns objects, not documents. Each result is actionable.

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
- Which identity provider authenticates people and agents?
- Where does the graph persist between restarts? The gateway holds it in memory for now.
- What are the deployment model and hosting targets?
- What are the performance and scale targets for the first release?

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
