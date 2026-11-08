# Design System Spec

Version 0.2. November 8, 2026. Applies to: Ontology-Driven AI Platform Prompt Specification v0.4, section 3.6.

This spec chooses the design system for the platform and defines how agents read it. It is platform-level and domain-free.

---

## 1. Decision

The platform uses **PatternFly** (Red Hat's open source design system), version 6.

| Requirement | How PatternFly meets it |
|---|---|
| Free | MIT license for all packages, including tokens, icons, tables, charts and the chatbot extension. No account or sign-in. |
| Atomic to organism coverage | Tokens, base components, composite components, extensions and layouts (mapped in section 3). |
| Page layouts and patterns | A Page template, seven layout primitives and documented patterns such as dashboard, primary-detail, card view, filters and bulk selection. |
| Built for data-dense enterprise work | Its home is enterprise and operations software: tables, filters, status, wizards and detail drawers. That matches the life sciences domains. |
| AI-readable | An official MCP server (`@patternfly/patternfly-mcp`, MIT) exposes the docs and guidelines to coding agents. Components are typed React, so props can be read as schemas. Tokens ship as data. |
| Conversational mode | An official chatbot extension (`@patternfly/chatbot`) supplies chat components, so chat is one mode inside the same system (platform spec 3.6). |

### Packages

| Package | Purpose | Version at decision |
|---|---|---|
| `@patternfly/react-core` | Base components and layouts | 6.7.0 |
| `@patternfly/react-table` | Tables | 6.7.0 |
| `@patternfly/react-tokens` | Design tokens as data | 6.7.0 |
| `@patternfly/react-icons` | Icons | 6.7.0 |
| `@patternfly/react-charts` | Charts | 8.7.0 |
| `@patternfly/react-component-groups` | Higher-level composites | 6.7.0 |
| `@patternfly/chatbot` | Conversational components | 6.9.0 |
| `@patternfly/patternfly-mcp` | Docs for coding agents (development time only) | 2.5.0 |

### Alternatives considered

| System | Why not chosen |
|---|---|
| IBM Carbon | Equally comprehensive and Apache-2.0. Its official MCP server is a hosted preview behind an IBMid sign-in and IBM Terms of Use. The stronger second choice. |
| Material Design 3 | Free and token-rich, but thin on enterprise data patterns. |
| GOV.UK, USWDS | Excellent pattern guidance, but built for public services, not data-dense expert tools. |
| Atlassian, Shopify Polaris | License terms tie use to their own ecosystems. |

---

## 2. Two Ways Agents Read the Design System

1. **Development time.** Coding agents (Claude Code) use the PatternFly MCP server to look up components, props, guidelines and accessibility rules while building the platform. It is configured in `.mcp.json` at the repo root.
2. **Run time.** The Compose agent does not browse docs. It reads a curated, machine-readable catalog checked into `design-system/` (section 4). The catalog is a subset of PatternFly, organized by atomic level, with the rules for when to use each piece. This keeps generation fast, bounded and repeatable.

The run-time catalog is part of the asset, like the specs. It is kept, versioned and improved. The renderer that draws it is built from the specs and changes when they do.

---

## 3. Atomic Mapping

PatternFly does not use atomic design terms. The platform maps it to them so agents can compose from small to large.

| Level | Meaning here | PatternFly building blocks |
|---|---|---|
| Tokens | Color, spacing, type, radius, motion, light and dark | `@patternfly/react-tokens` |
| Atoms | One element, one job | Button, Label, Badge, Icon, Text input, Checkbox, Radio, Switch, Spinner, Tooltip, Divider, Avatar, Title, Content |
| Molecules | A few atoms working as one control | Form group, Search input, Select, Dropdown, Menu, Text input group, Alert, Description list, Progress, Breadcrumb, Label group, Popover, Clipboard copy |
| Organisms | A self-contained section of a page | Card, Table, Toolbar, Form, Modal, Drawer, Wizard, Tabs, Data list, Navigation, Masthead, Empty state, Notification drawer, Charts, Chatbot |
| Layouts | How organisms are arranged | Bullseye, Flex, Gallery, Grid, Level, Split, Stack |
| Templates | A whole page frame | Page (masthead, sidebar navigation, main area, optional drawer) |
| Patterns | A proven arrangement for a kind of task | Dashboard, Primary-detail, Card view, Filters, Bulk selection, plus wizard, form and empty-state guidance |

---

## 4. Run-Time Catalog

The catalog lives in `design-system/` as JSON. Four files.

| File | Holds |
|---|---|
| `tokens.json` | The token subset the platform uses, for light and dark |
| `components.json` | Every allowed component: id, atomic level, PatternFly import, purpose, allowed props (as JSON Schema), slots, accessibility notes |
| `patterns.json` | Every allowed pattern: its template, layout, slots, and the conditions under which it fits |
| `view.schema.json` | The schema of a view spec, the only thing the Compose agent may output |

### 4.1 Pattern selection rules

Patterns are chosen by rules, not by free generation. The rules read the core loop step, the object and the context. This is what makes the same task produce the same UI shape (platform spec 5.4).

| Core loop step | Default pattern | Varies by |
|---|---|---|
| Orient | Dashboard inside the Page template, navigation generated from the ontology | Persona, open work, deadlines |
| Find | Filters and Toolbar over a Table, or Card view for few, visual objects | Result count, object type |
| Choose | Primary-detail: the object in a Drawer, valid methods as actions | Object state, persona permissions |
| Declare | Chatbot input or method buttons, side by side | Persona preference, task complexity |
| Compose | Form for one step, Wizard for several, Modal for a confirmation | Number of inputs a method needs |
| Commit | Preview as a Description list of before and after, then an Alert with the outcome | Whether the change is reversible |
| Continue | Cards of suggested next actions | New state, links to other domains |

### 4.2 View spec

The Compose agent emits a view spec: a tree of catalog components. Nothing else reaches the screen.

```json
{
  "pattern": "primary-detail",
  "because": "Drug Safety Physician opened a Safety Case in triaged",
  "root": {
    "component": "Drawer",
    "children": [
      {
        "component": "DescriptionList",
        "bind": "case:SC-0007",
        "props": { "fields": ["seriousness", "expectedness", "causality"] }
      },
      {
        "component": "Button",
        "props": { "variant": "primary", "label": "Assess" },
        "action": { "method": "Assess", "target": "case:SC-0007" },
        "because": "Assess is valid: workflow is triaged"
      }
    ]
  }
}
```

- `component` must exist in `components.json`. Props must validate against its schema.
- `bind` points to a graph object. Data is read through the gateway, never embedded by the agent.
- `action` names an ontology method. The gateway checks it again on commit.
- `because` records why a node is there. It powers "why am I seeing this" (platform spec 5.4).

The renderer validates the view spec, maps each node to its PatternFly component and renders it. An invalid spec is rejected and logged, never partly drawn.

---

## 5. Rules for Agents

1. Use only components and patterns in the catalog. Ask for a catalog change rather than inventing a component.
2. Use tokens, never raw colors or sizes.
3. Every interactive node has an accessible name. Every generated view meets WCAG 2.2 AA (platform spec section 7).
4. Show status with PatternFly's status colors and an icon or text, never color alone.
5. Generated or AI-drafted content is marked as such until a human accepts it.

---

## 6. Open Questions

- Should the catalog be generated from PatternFly's TypeScript types, or curated by hand?
- How small can the component subset be while still covering every journey?
- Should the platform add its own composites (for example, a state-transition preview) to the catalog?

---

## 7. Version Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-08 | Chose PatternFly 6. Defined atomic mapping, run-time catalog, pattern selection rules and view spec. |
| 0.2 | 2026-11-08 | Reframed for platform development. Renderer is maintained, not disposable. Added the WCAG 2.2 AA requirement to rule 3. |
