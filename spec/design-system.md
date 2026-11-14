# Design System Spec

Version 0.28. November 14, 2026. Applies to: Ontology-Driven AI Platform Prompt Specification v0.24, sections 3.6, 5.1, 5.4 and 7.

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

The platform uses PatternFly's default visual style, with two changes: the typeface and the card surface. There is no custom theme and there are no brand colors. Light and dark modes come from PatternFly, and both are supported from the start (section 4.2). The product name in the logo is set in configuration.

- **Typeface.** Inter, for headings and body alike, in place of Red Hat Display and Red Hat Text. It is set only through PatternFly's two font-family tokens, `--pf-t--global--font--family--heading` and `--pf-t--global--font--family--body`, so every component follows. Sizes, weights and line heights stay PatternFly's. Code keeps Red Hat Mono.
- Inter is bundled with the platform, the Latin and Latin Extended sets in the four weights PatternFly uses (400, 500, 600 and 700). It is never loaded from a font service, so the platform makes no outside requests and previews work offline. Inter is under the SIL Open Font License.
- **Card surface.** Three surfaces step evenly: the outer chrome (masthead and sidebar) on PatternFly's secondary background, the content area halfway between secondary and primary, and cards on primary. The content area has no border of its own. Cards carry a shadow subtler than PatternFly's small one: its 1px offset, half its blur, and its color at half the opacity. Every value is a PatternFly token or mixed from tokens, so dark mode follows: there the chrome is darkest and cards lightest.

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
| `@fontsource/inter` | The Inter typeface, bundled (see Visual style) | 5.3.0 |

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
| Masthead, right | The search field, then notifications, settings and profile, as icon buttons with accessible names |
| Sidebar | To do, then the object world of the person's work: their work domains as groups, and each domain's object types with a count (platform spec section 5.1). Each type opens a list of its objects |

The menu button is PatternFly's page toggle button, drawn as two lines rather than PatternFly's hamburger and arrow. While the sidebar is open the lines turn into an X, and back as it closes, timed by PatternFly's motion tokens for icons. With reduced motion asked for, the icon changes without moving. Its accessible name stays Navigation, and its expanded state says whether the sidebar is open.

All masthead items stay visible at every width, on one row with the logo, centered on the same line as the menu button. The product name is LS&H Ecosystem.

The sidebar is open beside the content from xl up. Below xl it is a drawer over the content, opened with the menu button and closed when a destination is chosen.

**Search.** The search field sits in the masthead, immediately left of the icon buttons, so it is in the same place on every page.

- From md up it is a field. Below md there is no room for a field beside the logo and the icons, so it is a Search icon button; choosing it opens the field in a row across the page under the masthead, with focus in it. That row closes when a search opens, on Escape, or on the button again.

- As the person types, the best five matches appear in a raised panel under the field, over the page, each its identifier and type, with a count of every match and a link to see them all. The count is announced to screen readers as it changes.
- Choosing a match, or pressing Enter, opens the search page; a match opens it at that object. Escape, or a click outside, closes the panel.
- The best matches under the field come from the ontology reading, so they appear as fast as the person types. The search page asks the connected model, if there is one, and says while it is understanding the query.
- The search page (`#/search/…`) shows who understood the query, "Understood by" the model or "Understood from the ontology", then how, as labels such as "Type: Safety Case", "Seriousness: serious" and "Yours", then the results as cards like an object list: identifier, type, state, why it matched, and the methods the person can run now. With no match, it says so and suggests fewer words.

**Process dock.** Processes the person has set aside wait in a dock along the bottom of the page, the platform chrome's footer. It is shown only while there is something in it.

- The dock's heading, "Set aside", has the large spacer above it, more than the space below it, so it never crowds the dock's top edge.
- Each process is one entry: the method and the object, a small progress bar, and its progress in words, such as "2 of 3 fields", "Ready to sign", "Running, 40%" or "Draft ready". Choosing an entry brings the process back in front; the process in front, if any, goes into the dock. A process in a modal covers the page, dock included, so the person minimizes it before choosing another; a page process leaves the dock in reach.
- Each entry has a close button, named for the process. Closing ends it without committing anything; a background run keeps running, and an undecided draft stays undecided.
- The entries sit in one row that scrolls sideways inside the dock when they do not fit, so the page itself never scrolls sideways.
- The dock is kept on the device for each person, like the appearance setting, until each process is finished or closed, and moves to their user context when identity exists. A typed signature is never kept: signing always starts fresh.

Settings opens a menu. For now it holds one setting, Appearance (section 4.2).

Notifications opens the notification drawer, PatternFly's Notification drawer over the content. Its button is a plain icon button like Settings and Profile, with no frame; a badge on it shows the number of unread notifications, and its accessible name says how many are unread. The drawer lists the person's notifications, newest first, each with its status icon, title, what it is about and when it came. Choosing one marks it read, and Mark all read clears the count. On phones the drawer takes the full width. New notifications appear without a reload.

Profile opens a menu showing who the person is and the role they act in. In development it also lists the seed graph's people, to act as any of them; it is labeled as a development tool and does not exist outside development and previews.

### 4.3 To do and object lists

To do, the list of a type's objects and the search page are object lists (pattern `card-view`), composed as view specs and drawn by the renderer. Each shows its objects as cards or as a list, the person's choice. Each card leads with the object's identifier and type in small text, such as "AE-005 · Adverse Event", then its title from the ontology as the card's heading, such as "Fever and cough; admitted to hospital with pneumonia". Then its state as labels, its deadline and urgency as status labels (a deadline to come as a warning, "Due", and one already past as a danger, "Overdue since"), and, on To do, the tasks waiting. Running a task from a card comes with the Compose step.

- On a type's list, each card also shows the methods the person can run on the object now, as buttons under "You can:". This is how a person reaches on-demand methods, such as running an analysis, on objects that are not on To do.
- An object with a background run that has not ended shows a status label naming the method and saying it is running.

**The list bar** is a low, quiet Toolbar above the objects, after Gmail's: a selection control at its start, the actions for what is chosen beside it only while something is, and the view controls at its end. It stays in view while the list scrolls. Its controls are plain icon and text buttons with tooltips, not links or boxed buttons.

- **Selection control.** PatternFly's bulk select: a checkbox split with a small menu.
  - The checkbox shows none, some or all of the listed objects chosen. Choosing it chooses every object when none is chosen, and none otherwise.
  - Beside it, how many are chosen, such as "3 selected".
  - Its menu offers Select all, with how many there are, and Select none.
- **At its end,** a compact toggle between Cards and List, as icon buttons with those names. The choice is kept on the device and applies to every object list.
- **Cards.**
  - Before selecting, the bar's start holds one plain Select button with a checkbox icon. It starts select mode and shows the selection control, with a close button, an X named "Done selecting", before it that ends select mode and clears the choice.
  - In select mode, each card shows a round select control at its top right: an empty circle, or a green check when chosen. It is a checkbox named "Select" and the object's title.
  - Choosing anywhere on a card, except its buttons, chooses it, rather than opening it. The card's title still opens the object.
  - A chosen card's border shows it is chosen, as well as its check.
- **List.** A table, PatternFly's Table. The selection control is always there.
  - Columns, in order: a checkbox, named "Select" and the row's identifier; Identifier; Title, a button that opens the object; Type, only when the list holds more than one type; Attention, the status labels (deadline, urgency and runs in progress), shown only when some listed object has one, and named so it never clashes with a state dimension named Status; then one column per state dimension the listed objects have, headed by the dimension's name, such as Workflow or Causality, with each value in plain text, and empty where the object's type has no such dimension; and last the row's actions.
  - The lifecycle dimension comes first among the state columns, then the rest by name.
  - Actions: a column pinned to the end of the row, behind a thin border, so it stays in view while a wide table scrolls under it; on phones, below md, it scrolls with the row, since pinned it would hide most of it. One method raised to the row, the first task waiting or else the first method available, and the rest in a "…" menu, named "More actions for" the object's identifier.
  - Cells keep their content on one line, with PatternFly's default, roomy cell padding, on the content area's white table surface. When the table is wider than the content area, it scrolls sideways inside itself; the page never does. It stays a table on phones.
- **Batch actions.** Once one or more objects are chosen, in either view, a thin divider follows the selection control, then the methods every chosen object has available that run for many (platform spec 5.4), as plain text buttons. The first three are shown; the rest are in a "…" menu named "More actions for the selected". When none applies to all of them, it says so, quietly.
  - A batch action opens its archetype's pattern once for all the chosen objects. The modal names the method and how many objects, gives the inputs once, then previews each object, naming any the gateway would refuse with its reasons.
  - Commit runs only the objects that would succeed, one commit each.
  - The outcome names each object, those changed and those refused, and the choice is cleared.
  - A batch is not set aside in the dock.

**The To do summary** sits above the list, under the heading "At a glance", with the standard gutter between the heading and the tiles, as between any section heading and its content. Four count tiles: waiting, urgent, due within 7 days and overdue, each a number with its name. They are selectable cards that work like one set of radio buttons: choosing urgent, due or overdue narrows the cards to those items, and choosing waiting shows them all again. Two tiles to a row on phones, four from md up.

### 4.4 The object panel

Every object opens in a side panel (platform spec 5.1, Within an object). It is the Choose step's primary-detail pattern: PatternFly's Drawer, its panel over the content area.

- **Opening.** A click anywhere on a card opens its object, except on the card's buttons. The card's title is also a button, so keyboard and screen reader users open it the same way. Cards and linked objects inside the panel open the same way, and so do search results.
- **Size.** The panel slides in from the right and takes three quarters of the content area from lg up, and all of it below. From lg up, Expand widens it to the whole content area and Restore returns it; the choice is kept on the device. The masthead, the sidebar and the process dock stay in reach, and choosing another card behind the panel opens that object in its place.
- **Top bar.** Back, a left arrow named "Back to" the previous object's identifier, once the person has moved in. Expand or Restore. Close, an X at the top right, which closes the whole panel; Escape does too. Focus moves to the object's heading as the panel opens, and back to the card that opened it as the panel closes.
- **Moving in.** Opening a related object slides the current one out to the left as the new one slides in from the right. Back reverses it. The slide is timed by PatternFly's motion tokens; with reduced motion asked for, the content changes without moving.
- **Header.** The identifier and type in small text, the title as the panel's heading, the state as labels, the deadline and urgency as status labels, and the methods the person can run now as buttons. Running one opens its process as from a card. While a page pattern, such as Compare and decide, is in front, the panel steps aside; after any commit it shows the object as it now is.
- **Tabs** (pattern `object`) under the header: Overview, then one tab per relationship end that holds many objects, each with its count, contained objects first. On phones the tabs scroll sideways.
  - **Overview.** The properties as a description list. Then Linked, the ends that hold at most one object, each named by the type at its other end, such as Study, or by its relationship when two reach the same type or it reaches the object's own type, such as "Duplicate of", with a link to the object or None. Then the type, its domain and the last change: the method, who ran it and when.
  - **Each other tab** says what the relationship means from here, such as "This study enrolls these patients.", then lists the objects as cards like an object list, each with the methods the person can run on it, or says there are none yet.

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
- The page sets its own base text color, background, font and line height from tokens, on the page itself, not only through PatternFly's low-priority base styles. A page the platform is embedded in, such as a preview host, can then never turn text black on the dark theme or change the chrome's alignment.
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
2. The button opens the archetype's modal, titled with the method and the object's identifier, with the object's title under it.
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

**Review a draft, step by step:**

1. The method's button on a card opens the pattern in place of the view, titled with the method and the object.
2. The gateway is asked for a draft at once. While the model writes, a spinner says it is drafting and with which model.
3. The draft appears under a label saying it is a generated draft, not yet reviewed (rule 5), with the model that wrote it, when, and the objects it was given. If no model is connected, or the model declines, the reasons appear instead.
4. **Accept** (primary) commits the method with the draft's text. **Edit** makes the text editable; Accept then commits the edited text, and the outcome says it was edited. **Discard** records the draft as discarded. **Back** returns without deciding, and the draft is never used.
5. After Accept or Discard, the view returns with an Alert: what changed, who accepted it and that it came from a generated draft, or that the draft was discarded.

**Start and track, step by step:**

1. The method's button on a card opens a small modal, titled with the method and the object.
2. Any inputs, then the preview: what starting the run changes now, and what the run will do in the background, said plainly as work that starts when they press the button. If the method cannot run, the reasons instead.
3. The start button is named for the method. Cancel closes the modal and changes nothing.
4. Once started, the modal shows the run: a Progress bar with its status, and that the person can close the modal and keep working, because Notifications will tell them when it ends. Its button is Keep working while the run goes on, and Done once it ends; neither stops the run.
5. When the run ends while the modal is open, it shows the outcome: what was found and created, or why it failed.
6. Closing the modal returns to the list, with an Alert saying the run started or how it ended. The object's card shows the run while it is running.

**Setting a process aside, step by step:** every pattern has a **Minimize** button: a minus icon with the tooltip and name Minimize, immediately left of a modal's close button, or at the right of a page pattern's title. It is in the same place for every archetype. It sends the process to the dock with everything given so far, and returns the person to the view underneath. Starting another process, or restoring one from the dock, minimizes the one in front the same way. Progress in the dock comes from the archetype:

| Archetype | Progress |
|---|---|
| Confirm | Ready to confirm, once the preview is ready |
| Fill in, Compare and decide | Fields given out of fields needed, then Ready to commit |
| Review and sign | Fields given, then Ready to sign once the preview is ready |
| Start and track | Not started; then the run's own status and progress |
| Review a draft | Drafting; Draft ready; Editing |

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
- `intent` gives a button its role in an interaction: `submit` commits, `cancel` closes without changing anything, `edit` makes generated text editable, `discard` records a draft as discarded, and `minimize` sets the process aside in the dock.
- A selectable Card with a `field` and a `value` works as one of a set of radio buttons: choosing it sets the field to its value.

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
- Settings opens a menu; does it later need its own page?
- Which events besides a run ending should notify a person, such as work assigned to them, and may they choose how they are notified?
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
| 0.12 | 2026-11-11 | Start and track specified step by step: a modal to start, then the run's progress and outcome. Notifications opens a notification drawer with an unread count. Object list cards offer the methods the person can run now and show runs in progress. Closed the question of what notifications open. |
| 0.13 | 2026-11-12 | Review a draft specified step by step: a page that asks for the draft at once, shows it marked as generated with its model and sources, then Accept, Edit, Discard or Back. The view spec gains the `edit` and `discard` intents. |
| 0.14 | 2026-11-12 | Added the process dock to the chrome (4.1), the To do summary with counts and work by type and stage (4.3), and setting a process aside with progress by archetype (5.1). The view spec gains the `minimize` intent and selectable cards bound to a field. |
| 0.15 | 2026-11-12 | A deadline already past is labeled Overdue since, as a danger, not Due, as a warning. |
| 0.16 | 2026-11-13 | Added the search field to the sidebar and the search page (4.1). |
| 0.17 | 2026-11-13 | Cards lead with the identifier and type in small text, then the object's title as their heading. Minimize is a minus icon left of the close button, or right of a page pattern's title. |
| 0.18 | 2026-11-13 | Search page says who understood the query, the model or the ontology, and shows Yours for the person's own objects. Suggestions under the field come from the ontology reading. |
| 0.19 | 2026-11-13 | Product name LS&H Ecosystem, centered with the menu button. The page owns its base text color, background and font, so an embedding page cannot override them in dark mode. A gutter under At a glance and above the dock's heading. |
| 0.20 | 2026-11-13 | Search moves from the sidebar to the masthead, left of the icon buttons; below md it is an icon button that opens the field under the masthead. Matches show in a raised panel. More space above the dock's heading. |
| 0.21 | 2026-11-14 | Inter replaces the Red Hat typefaces for headings and body, through PatternFly's two font-family tokens, bundled rather than loaded from a font service. |
| 0.22 | 2026-11-14 | Card surface: the content area takes PatternFly's secondary background and cards a small shadow, for more contrast between cards and the page. |
| 0.23 | 2026-11-14 | Card surface made subtler: the content area halfway between the chrome's gray and the card surface, no border around it, and a lighter, shallower card shadow. |
| 0.24 | 2026-11-14 | The menu button is two lines that turn into an X while the sidebar is open, instead of PatternFly's hamburger with an arrow. |
| 0.25 | 2026-11-14 | Added the object panel (4.4): cards open their object in a side panel, three quarters of the content area and expandable to all of it, with a header of identity, state and methods, then tabs for the overview and each many-valued relationship end. Moving in slides the current object out; Back steps out one at a time; Close ends the panel. |
| 0.26 | 2026-11-14 | Notifications is a plain icon button like Settings and Profile. Object lists show cards or a list, with a list bar: select mode with a round select control on cards, checkboxes on rows, one raised method per row and the rest in a … menu, and batch actions for the methods every chosen object has. The To do summary is its count tiles only. |
| 0.27 | 2026-11-14 | The list bar follows Gmail's: PatternFly's bulk select checkbox with its menu and count at the start, the chosen objects' actions as plain buttons after a divider, extras in a … menu, and the view toggle at the end. Select and Done selecting are icon buttons. |
| 0.28 | 2026-11-14 | The list view is a table: checkbox, identifier, title, type when mixed, status labels, one column per state dimension with plain values, and actions. Wide tables scroll sideways inside themselves. |
