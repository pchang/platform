# Ontology-Driven AI Platform: Prompt Specification

Version 0.2. November 7, 2026. Author: Paul Chang.

This is a living prompt. It drives the generation of a platform demo. We improve the prompt, not the demo. Each version of the demo is disposable. The spec is the asset.

This spec stays abstract on purpose. It defines the pattern, not a domain. Concrete examples come later, when a specific domain is applied to it.

---

## 1. The Prompt

You are building a demo of an AI platform. The platform has no hardcoded screens, menus or workflows. Everything a person sees and does is derived from an underlying model: an ontology and a knowledge graph. Agents read that model. Agents act on it. Agents compose the interface a person needs, at the moment they need it.

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

---

## 4. The Core Loop

Every interaction follows the same loop. The demo must show it end to end.

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

## 6. Demo Scope

The demo proves the pattern, not the scale.

- More than one domain, to prove the platform is domain-independent.
- At least one link across domains.
- More than one persona, to show context-driven adaptation.
- Journeys that run the full core loop, including an edge case the agents resolve without special code.
- An external agent completing a task through the gateway.
- A way to inspect the ontology, graph, method and policy behind any view.

Specific domains, personas and journeys are defined in a later section or a separate domain spec.

---

## 7. Non-Goals for the Demo

- Production security, scale or performance.
- Real data integrations.
- Final visual design. The design system needs to be coherent, not finished.

---

## 8. Acceptance Criteria

The demo succeeds when:

1. Adding a new domain requires only a new ontology and seed graph.
2. The same object adapts to different personas, for reasons the platform can explain.
3. A person can reach and act on any object by declaring intent.
4. An external agent completes a task without any UI.
5. Every change is traceable from intent to outcome.

---

## 9. Open Questions

To resolve in future versions of this spec.

- How is the ontology expressed?
- How are methods authored and versioned? Who owns them?
- How much autonomy do agents get before they must ask a human?
- How does the platform resolve conflicting context?
- What is the trust model for external agents and federated platforms?
- How is the generated UI tested for consistency and accessibility?

---

## 10. Version Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-07 | First draft from freeform brief. |
| 0.2 | 2026-11-07 | Abstracted state to n-dimensional spaces. Removed domain examples and fixed counts. Agent roles marked illustrative. |
