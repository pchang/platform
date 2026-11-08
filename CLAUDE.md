# CLAUDE.md

This repo holds an ontology-driven AI platform demo. Read `spec/ontology-platform-prompt-spec.md` before doing any work here.

## Working rules

- **Improve the prompt, not the demo.** The spec is the asset; demo builds are disposable. If a demo needs a change that reflects a gap in the spec, propose the spec change first, then regenerate.
- **Keep the abstract spec domain-free.** Concrete domains, personas and journeys go in separate domain specs under `spec/`, not in the main prompt spec.
- **When you change the spec,** bump its version, update the date and add a row to the Version Log (section 10).
- **No hardcoded screens in the demo.** Navigation, actions and UI must be derived from the ontology, graph and context (spec sections 2 and 3). A new domain must need only a new ontology and seed graph.
- **Agents go through the gateway.** No code path may read or write the graph except through the intelligence gateway.
- **Design system.** Build UI only from PatternFly, through the catalog in `design-system/` (see `spec/design-system.md`). Use the `patternfly` MCP server in `.mcp.json` to look up components and guidelines.
