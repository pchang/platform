# CLAUDE.md

This repo holds an ontology-driven AI platform, built for production use. Read `spec/ontology-platform-prompt-spec.md` before doing any work here.

## Working rules

- **Spec first.** The spec is the asset and leads the code. If the code needs a change that reflects a gap in the spec, propose the spec change first, then build it.
- **No shortcuts.** Build to the quality requirements (platform spec section 7) and the domain obligations. Do not stub, fake or hardcode behavior the spec defines. If something cannot be built yet, say so and record it as an open question in the spec.
- **Keep the abstract spec domain-free.** Concrete domains, personas and journeys go in separate domain specs under `spec/`, not in the main prompt spec.
- **When you change the spec,** bump its version, update the date and add a row to the Version Log (section 10).
- **No hardcoded screens.** Navigation, actions and UI must be derived from the ontology, graph and context (spec sections 2 and 3). A new domain must need only a new ontology and seed graph.
- **Agents go through the gateway.** No code path may read or write the graph except through the intelligence gateway.
- **Patient centricity.** Never call a person in a study a "subject". Use patient, or participant where the study has no disease state (see the Terminology section of `spec/domain-life-sciences.md`).
- **Design system.** Build UI only from PatternFly, through the catalog in `design-system/` (see `spec/design-system.md`). Use the `patternfly` MCP server in `.mcp.json` to look up components and guidelines.
