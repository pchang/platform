# platform

AI-native platform demo, driven by an ontology and a knowledge graph.

## How this repo works

The spec is the asset. The demo is disposable.

- [`spec/ontology-platform-prompt-spec.md`](spec/ontology-platform-prompt-spec.md) is a living prompt. It defines the pattern: ontology, knowledge graph, context, intelligence gateway, agents and generated experience.
- Each demo is generated from the spec. When a demo falls short, improve the spec and regenerate rather than patching the demo by hand.
- Domain specs (concrete domains, personas and journeys) are applied on top of the abstract spec and live alongside it in `spec/`. The first is [`spec/domain-life-sciences.md`](spec/domain-life-sciences.md).

## Layout

| Path | Purpose |
|---|---|
| `spec/` | The prompt specification and domain specs. Versioned and kept. |
| `demo/` | Generated demo builds (not yet created). Replaceable at any time. |
