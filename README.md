# platform

An AI-native platform, driven by an ontology and a knowledge graph.

## How this repo works

The spec is the asset. The spec leads and the code follows.

- [`spec/ai-native-platform-spec.md`](spec/ai-native-platform-spec.md) is a living prompt. It defines the pattern: ontology, knowledge graph, context, intelligence gateway, agents and generated experience.
- The platform is built from the spec. When it falls short, close the gap in the spec first, then in the code, rather than patching the code alone.
- Domain specs (concrete domains, personas and journeys) are applied on top of the abstract spec and live alongside it in `spec/`. The first is [`spec/domain-life-sciences.md`](spec/domain-life-sciences.md).
- [`spec/design-system.md`](spec/design-system.md) picks the design system (PatternFly) and defines how agents read it.

## Layout

| Path | Purpose |
|---|---|
| `spec/` | The prompt specification and domain specs. Versioned and kept. |
| `design-system/` | The run-time design system catalog the Compose agent reads (not yet created). Kept. |
| `src/` | Platform code, built from the specs (not yet created). Changes when the specs do. |
