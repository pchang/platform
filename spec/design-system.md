# Design System Spec

Version 0.11. November 11, 2026. Applies to: Ontology-Driven AI Platform Prompt Specification v0.16, sections 3.6, 5.1, 5.4 and 7.

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

### Visual style

The platform uses PatternFly's default visual style, unchanged: no custom theme, brand colors or fonts. Light and dark modes come from PatternFly, and both are supported from the start (section 4.2). The only product-specific element is the product name in the logo, set in configuration.

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
2. **Run time.** The Compose agent does not browse docs. It reads a curated, machine-readable catalog checked into `design-system/` (section 5). The catalog is a subset of PatternFly, organized by atomic level, with the rules for when to use each piece. This keeps generation fast, bounded and repeatable.

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

## 4. Responsive Design

Every token, component, organism, layout, template and pattern works at every width from 320 CSS pixels (a small phone) up. Responsiveness is part of each catalog entry, not a later pass.

- **Breakpoints** are PatternFly's: sm 576px, md 768px, lg 992px, xl 1200px, 2xl 1450px. No custom breakpoints.
- **Mobile first.** The default layout is the smallest. Larger breakpoints add to it.
- **No horizontal page scrolling** at any width. Wide content, such as tables and charts, scrolls inside its own container or changes form, for example a table becoming a list of cards.
- **Target size.** Every interactive target meets WCAG 2.2 AA target size.
- **Declared behavior.** Each entry in `components.json` and `patterns.json` records how it behaves at each breakpoint.
- **Tested.** Each entry is tested at 320px, at md and at xl, in light and dark mode.

### 4.1 Chrome

The masthead and the sidebar of the Page template are the platform chrome. Their structure is the same in every domain; the sidebar's content is generated for each person.

| Position | Content |
|---|---|
| Masthead, left | A menu button that opens and closes the sidebar, then the text-based logo: the product name, set in configuration. The logo links to To do |
| Masthead, right | Notifications, settings and profile, as icon buttons with accessible names |
| Sidebar | To do, then the object world of the person's work: their work domains as groups, and each domain's object types with a count (platform spec section 5.1). Each type opens a list of its objects |

All masthead items stay visible at every width, on one row with the logo. The product name is LS&H.

The sidebar is open beside the content from xl up. Below xl it is a drawer over the content, opened with the menu button and closed when a destination is chosen.

Settings opens a menu. For now it holds one setting, Appearance (section 4.2).

Profile opens a menu showing who the person is and the role they act in. In development it also lists the seed graph's people, to act as any of them; it is labeled as a development tool and does not exist outside development and previews.

### 4.3 To do and object lists

To do and the list of a type's objects are card views (pattern `card-view`), composed as view specs and drawn by the renderer. Each card shows the object's identifier and type, its state as labels, its deadline and urgency as status labels, and, on To do, the tasks waiting. Running a task from a card comes with the Compose step.

### 4.2 Light and dark mode

Every component, pattern and view works in both light and dark mode. Dark mode is PatternFly's own dark theme.

| Appearance setting | Behavior |
|---|---|
| Automatic (default) | Follows the local time of day: light from 07:00 to 19:00, dark otherwise. Switches at those times without a reload |
| Light | Always light |
| Dark | Always dark |

- The day hours are configuration, not code.
- The setting belongs to the person and will live in their user context (platform spec 3.3). Until identity exists, it is kept on the device.
- Because colors come only from tokens (rule 2), components need no theme-specific code.
- The accessibility scans in section 4 run in both modes.

---

## 5. Run-Time Catalog

The catalog lives in `design-system/` as JSON. Four files, each with a schema in `design-system/schema/`.

| File | Holds |
|---|---|
| `tokens.json` | The token subset the platform uses. Tokens are named, not copied: values come from PatternFly, so light and dark stay in sync with it |
| `components.json` | Every allowed component: id, atomic level, PatternFly import, purpose, when to use and avoid it, allowed props (as JSON Schema), slots, responsive behavior, accessibility notes and at least one example |
| `patterns.json` | Every allowed pattern: its template, layout, slots, and the conditions under which it fits |
| `view.schema.json` | The schema of a view spec, the only thing the Compose agent may output |

The catalog is curated by hand and checked by automated tests against the pinned PatternFly packages: every import must exist, every props schema must compile, every example must validate, and every token must exist. Platform CSS may use only tokens listed in `tokens.json`.

Allowed props use PatternFly's prop names, so the renderer passes them through. Two exceptions: `label` carries a component's text, which the renderer passes as children (or as PatternFly's own `label` prop for components that have one, such as Checkbox), and Icon's `name` picks an icon from `@patternfly/react-icons`.

The catalog grows by atomic level. It starts with tokens, atoms and layouts. Molecules, organisms and patterns are added when a view needs them, each with its tests.

### 5.1 Pattern selection rules

Patterns are chosen by rules, not by free generation. The rules read the core loop step, the object and the context. This is what makes the same task produce the same UI shape (platform spec 5.4).

| Core loop step | Default pattern | Varies by |
|---|---|---|
| Orient | Dashboard inside the Page template, navigation generated from the ontology | Persona, open work, deadlines |
| Find | Filters and Toolbar over a Table, or Card view for few, visual objects | Result count, object type |
| Choose | Primary-detail: the object in a Drawer, valid methods as actions | Object state, persona permissions |
| Declare | Chatbot input or method buttons, side by side | Persona preference, task complexity |
| Compose | The pattern of the method's interaction archetype, in the table below | The archetype (platform spec 5.4) |
| Commit | Preview as a Description list of before and after, then an Alert with the outcome | Whether the change is reversible |

Each interaction archetype has one pattern. On phones, every surface below takes the full width of the screen, less PatternFly's standard margin, and scrolls inside itself when tall.

| Archetype | Surface | Pattern |
|---|---|---|
| Confirm | Modal, small | The question, the preview of what changes, then Confirm and Cancel |
| Fill in | Modal, medium | A Form with one field per input, the preview, then the commit button named for the method |
| Choose an object | Modal, medium | A searchable list of the objects that qualify, then the preview |
| Step by step | Wizard | One step per group of inputs, a review step with the preview, then commit |
| Compare and decide | Page | The two objects side by side as cards, differences marked; they stack on phones. The decision, then the preview |
| Review a draft | Page | The draft, marked as generated until accepted (rule 5); Accept, Edit and Discard |
| Review and sign | Wizard | A review step with the preview, then a signature step showing the signer, the time and the meaning of the signature |
| Start and track | Modal, then the object | Confirm the start; progress then shows on the object, and Notifications tells the person when it ends |

**Fields come from the inputs.** Each input's kind decides its field: text gives a text area, a value from a concept scheme gives radio buttons side by side for up to five values, so each has room to be tapped, and a select beyond that, a person gives a select of people that defaults to the person acting, an object gives a searchable list, and a web address gives a URL field.

**After every commit**, a success Alert says what changed, and the person returns to where they came from, with the object updated and its next tasks, if any, shown.

The components these patterns need, such as Modal, Form, Description list, Alert and Wizard, join the catalog as each archetype is built.

**Confirm and Fill in, step by step:**

1. On a To do card, each task waiting is a button named for the method. Tasks whose archetype is not built yet are shown as text.
2. The button opens the archetype's modal, titled with the method and the object.
3. Fill in shows one field per input, with the input's choices and default from the gateway. Confirm shows no fields.
4. As soon as every input has a value, the modal shows the preview from the gateway: each value that will change, from old to new, and each object that will be created. If the method would fail, it shows the reasons instead, and the commit button stays disabled.
5. The commit button is named for the method. Cancel closes the modal and changes nothing.
6. After the commit, the modal closes, a success Alert at the top of the view says what changed, and To do refreshes.

**Compare and decide, step by step:**

1. The task's button on a To do card opens the pattern in place of To do, titled with the method and the object.
2. A select offers the objects that qualify for the method's object input, from the gateway.
3. The object and the chosen one appear side by side as cards: their state, properties and links, in the same order on both. Each row whose values differ is marked Different. On phones the cards stack.
4. Below them, the preview: each value that will change, and each effect the gateway records as pending work, said plainly as later work, not as done.
5. The commit button is named for the method. Cancel returns to To do and changes nothing. After the commit, To do returns with the success Alert.

**Review and sign, step by step:**

1. The task's button on a To do card opens a Wizard in a modal, titled with the method and the object.
2. **Review**: any inputs, where a person input is fixed to the person signing, then the preview of what will change and what will be recorded for later, or the reasons it cannot run. Next stays disabled until the preview is ready.
3. **Sign**: the signer's name, the meaning of the signature, and that the date and time are recorded when they sign. Until the identity provider exists, the person types their full name, and a warning says the signature is a development signature, not a valid electronic signature.
4. The final button is named for the method and stays disabled until the typed name matches. Back returns to Review. Cancel closes without changing anything.
5. After the commit, To do returns with the success Alert, which says the change was signed and by whom.

**Overlays in the catalog preview.** Components that open over the page, such as Modal, are validated like every other entry, but the catalog preview describes them in words instead of opening them. They can be tried from To do.
| Continue | Cards of suggested next actions | New state, links to other domains |

### 5.2 View spec

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
- `field` binds a form control to one input of the method being composed, by the input's name. The renderer keeps the value; the view spec never holds it.
- `intent` gives a button its role in an interaction: `submit` commits, `cancel` closes without changing anything.

The renderer validates the view spec, maps each node to its PatternFly component and renders it. An invalid spec is rejected and logged, never partly drawn.

### 5.3 Renderer

- Validates the whole view spec against the catalog before drawing anything, including that its pattern exists in `patterns.json`.
- Maps each node to the PatternFly export named in its catalog entry. Nothing outside the catalog can be drawn.
- Gives form controls the ids PatternFly needs, so labels stay connected to their inputs.
- Runs a node's `action` only through a handler supplied by its host. With no handler, nothing runs.
- Resolves `bind` through the gateway. Until the gateway exists, bound nodes render with the props in the view spec, and the host shows the binding.

### 5.4 Catalog preview

A page at `#/catalog` shows the whole catalog so people can review it on any device.

- It is itself a view spec, built from the catalog data with the card-view pattern and drawn by the renderer. No part of it is hand-built UI.
- It shows every component, grouped by level: purpose, when to use and avoid it, responsive behavior, accessibility notes, and each example drawn live, with its binding, action and reason shown as text. It also lists the tokens and their uses.
- Examples are not connected to the gateway. Actions do not run and bindings are shown, not read.
- It is tested at 320px, md and xl, with an accessibility scan in a real browser.

---

## 6. Rules for Agents

1. Use only components and patterns in the catalog. Ask for a catalog change rather than inventing a component.
2. Use tokens, never raw colors or sizes.
3. Every interactive node has an accessible name. Every generated view meets WCAG 2.2 AA (platform spec section 7).
4. Show status with PatternFly's status colors and an icon or text, never color alone.
5. Generated or AI-drafted content is marked as such until a human accepts it.
6. Every view works from 320px up with no horizontal page scrolling (section 4).

---

## 7. Open Questions

- How small can the component subset be while still covering every journey?
- Should the platform add its own composites (for example, a state-transition preview) to the catalog?
- What do notifications and profile open: a drawer, a menu or a page? Settings opens a menu; does it later need its own page?
- Should Automatic follow sunrise and sunset at the person's location instead of fixed hours?

---

## 8. Version Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-08 | Chose PatternFly 6. Defined atomic mapping, run-time catalog, pattern selection rules and view spec. |
| 0.2 | 2026-11-08 | Reframed for platform development. Renderer is maintained, not disposable. Added the WCAG 2.2 AA requirement to rule 3. |
| 0.3 | 2026-11-08 | Added Responsive Design (section 4) and the chrome definition. Renumbered later sections. Added rule 6 and two open questions. |
| 0.4 | 2026-11-08 | Visual style is PatternFly's default. Product name is LS&H. Catalog is curated by hand and checked by tests; added entry contents, prop convention and growth by level. Closed two open questions. |
| 0.5 | 2026-11-08 | Added the renderer (5.3) and the catalog preview (5.4). Added Card, CardTitle and CardBody and the card-view pattern, which the preview needs. Clarified the label exception. |
| 0.6 | 2026-11-08 | Added light and dark mode (4.2): automatic by time of day, with a Light or Dark override in a Settings menu. Tests run in both modes. |
| 0.7 | 2026-11-09 | Chrome gains the sidebar: generated navigation, open from xl up and a drawer below. Profile shows the person and role, with a development persona switcher. Added To do and object lists as card views (4.3). |
| 0.8 | 2026-11-11 | Compose uses the pattern of the method's interaction archetype: one surface and pattern per archetype, full screen on phones; fields derived from input kinds; the same ending after every commit. |
| 0.9 | 2026-11-11 | The view spec gains `field` and `intent`. Confirm and Fill in specified step by step. Overlays are described, not opened, in the catalog preview. |
| 0.10 | 2026-11-11 | Compare and decide specified step by step. Previews show pending work as later work. |
| 0.11 | 2026-11-11 | Review and sign specified step by step: a Wizard with Review and Sign steps. |
