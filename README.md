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
| `ontology/` | The ontology in RDF 1.2 with SHACL: the platform vocabulary and each domain. Kept. |
| `design-system/` | The run-time design system catalog the Compose agent reads: tokens, components, patterns and the view spec schema. Kept. |
| `src/` | Platform code, built from the specs. Changes when the specs do. |
| `e2e/` | Browser tests, including responsive checks at 320px, md and xl. |

## Run it

Needs Node 22 or later.

```bash
npm install
npm run dev        # local dev server; the design system catalog is at /#/catalog
npm test           # unit and accessibility tests
npm run test:e2e   # browser tests at phone, tablet and desktop widths
npm run build      # type check and production build
```
