# Design System Spec

Version 0.56. November 21, 2026. Applies to: Ontology-Driven AI Platform Prompt Specification v0.30, sections 3.6, 5.1, 5.4 and 7.

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
- **The chat panel follows the same style** (4.1, Ask), so chat reads as a mode of the same product, not a separate one. The panel is chrome. Its header lines up with the masthead: the same height and padding, the title in the logo's size and weight, and plain icon buttons like the masthead's, with no divider. The conversation and the message bar sit on the content surface, inset from the panel's edges as the content area is from the page's, with the same rounding; on phones, as the content area does there, it runs to the edges. Cards, such as prompts and cited objects, are on the card surface with the card shadow, and so are the person's own messages: no brand-colored fills. The welcome's greeting is set as a page's main heading and its line as body text, as on To do. The message bar is a field like any other, with PatternFly's small rounding and default border, and the footnote is small, subtle text. The panel has no border or shadow of its own: the surfaces set it apart.

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
| Masthead, left | A menu button that opens and closes the sidebar, then the logo, which links to Home: the brand's own logo, one image file set in configuration (see Brand logo, below); where none is configured, or its file cannot be loaded, the product name as text |
| Masthead, right | Ask, notifications, settings and profile, as icon buttons with accessible names |
| Sidebar | Home, then the object world of the person's work: their work domains as groups, and each domain's object types with a count (platform spec section 5.1). Each type opens a list of its objects |

The menu button is PatternFly's page toggle button, drawn as two lines rather than PatternFly's hamburger and arrow. While the sidebar is open the lines turn into an X, and back as it closes, timed by PatternFly's motion tokens for icons. With reduced motion asked for, the icon changes without moving. Its accessible name stays Navigation, and its expanded state says whether the sidebar is open.

All masthead items stay visible at every width, on one row with the logo, centered on the same line as the menu button. The product name is LS&H Ecosystem. On a phone, where the actions leave little room, the name wraps onto a second line, "LS&H" over "Ecosystem", before it is ever cut short with an ellipsis.

**Brand logo.** A branded deployment shows its parent brand's own logo in the masthead in place of the product name as text: the brand's mark with the product's short name beside it, in the brand's lettering, as one image.

- **The artwork is the brand's, never ours.** The logo is the brand's approved SVG file, kept in `public/brand/` and named in `src/config/product.ts`. The platform never redraws, retypes, recolors or stretches it. Its viewBox is cropped to the artwork, so it carries no empty margin, and its paths are kept exactly as supplied. A deployment with no approved file shows the product name as text.
- **Lockup.** One image, centered on the menu button's line. It is sized by height, 24px on phones and 32px from md up, so its proportions never change, and where the masthead has less room, as on a 320px phone, it scales down to fit, never wrapping, clipping or pushing the actions. Both copies are decorative, with an empty alternative text; the link around them is named for the full product name, which begins with the short name the logo shows, so the name never depends on which copy is showing and a voice user can say what they see.
- **Light and dark.** The logo is supplied in two colors: the brand's own, for light mode, and a reversed copy, the same paths in white, for dark mode, shown in dark mode. With only one file configured, it shows in both modes, so it must hold its contrast on the masthead's surface in both.
- **Falls back, never breaks.** If the file cannot be loaded, the logo is replaced by the product name as text (4.1), so the masthead never shows a broken image. The sign-in page and the chat keep the product name as text.

The sidebar is open beside the content from xl up. Below xl it is a drawer over the content, opened with the menu button and closed when a destination is chosen.

**Ask.** A chat button, a pair of speech bubbles (PatternFly's comments icon) named "Ask", sits in the masthead immediately left of the icon buttons, at every width. It opens the chat panel: a conversation with the platform, for a search or a question (platform spec 5.2, Asking a question). It replaces a search field in the masthead, and in time it is where agentic sessions start.

- **The panel** is PatternFly's chatbot (`@patternfly/chatbot`). From lg up it is docked at the right, the full height of the window, and the page moves left to make room, so the person works beside it: an object opened from the chat opens in the object panel next to it. Below lg it is docked over the page, and below md it fills the screen; there, opening an object closes the chat, keeping the conversation, so the object can be read.
- **Header:** the title "Ask", a New conversation button and Close. Escape closes it too, and focus returns to the Ask button.
- **Before the first message,** a welcome of its own, not To do's greeting: the title "Search or ask anything" and the line "Find objects, or ask about the work you may see.", with three prompts that work in any domain: "What needs me first today?", "What is overdue or due this week?" and "Summarize the work waiting for me." Choosing one sends it.
- **Ask about this.** Every object can start a conversation about itself, so the person never has to describe it (platform spec 5.2, About an object). The entry point is the same speech bubbles, named "Ask about" and the identifier. **Anticipation first:** the method buttons are what the platform anticipates the person wants to do, so they come first; Ask follows them, as the free-text way forward when the anticipation misses.
  - on an object's card, last in the row of its method buttons; a card with no method buttons has it alone at the foot of its body;
  - on a list's row, last among its actions, after the raised method and its … menu, at the right end of the actions column, so the Ask buttons line up down the list;
  - in the object panel's header, beside Expand and Close.
  - in an object list's bar, while objects are chosen, last after the set and batch actions, named "Ask about the" and how many are chosen, such as "Ask about the 3 selected" (4.3).

  It opens the chat on a new conversation about the object, keeping the one before in the history. The object leads the conversation as a card like an object list's: its identifier and type in small text, its title, which opens it, its state, and the methods the person can run on it now as buttons, which run as they do anywhere. The welcome becomes "Ask about" and the identifier, with the title as its line, and three prompts about it: "Summarize" it, "What can I do next on" it, "and why?", and "What is" it "linked to?". The message bar reads "Ask about" and the identifier. Every question in the conversation is about it, until New conversation.

  **About the chosen.** From the list bar, the conversation is about every chosen object, up to ten, the most a question can be asked from (platform spec 5.2, About an object); with more chosen, the button is unavailable but still focusable, and its tooltip says "Choose ten or fewer to ask about them." The objects lead the conversation as a stack of compact cards, each its identifier and type in small text and its title, which opens it, without state or methods: the list shows its state, and its batch actions run on them. Up to three show whole; more scroll within themselves so the welcome and its prompts stay in view. The welcome becomes "Ask about these" and how many, such as "Ask about these 3", with their identifiers as its line, and three prompts about them: "Summarize these 3", "How do they differ?" and "What can I do next on them, and why?". The message bar reads "Ask about these 3". The history names the conversation by its identifiers, such as "SSC-1, SSC-3". Every question in it is about all of them, until New conversation.
- **The message bar** at the foot, "Search or ask", sends on Enter or with its Send button. Under it, a footnote: "Answers come from what you may read. Check them before you act."
- **Messages.** The person's message on the right, named for them. The platform's reply, named for the product, shows a loading state until the gateway answers, then:
  - **An answer:** the model's text, then the objects it cites as sources, one under another with an object list's gutter, each like an object list's card: its identifier and type in small text, then its title, which opens the object; and in small text which model answered and how many objects it looked at.
  - **A question searched instead:** why, in the model's place ("No model is connected to answer questions, so the question was searched."), then the best matches as sources, and "See all N on the search page", which opens the search page. With no match, it says so and suggests fewer words.
  - **A refusal or failure:** an inline danger alert with the gateway's reasons.
- **No zoom on focus.** On touch screens, phones zoom the page in when a field whose text is smaller than 16px takes focus, and the page then runs wider than the screen. So on touch screens every text field, the message bar and those in forms alike, uses the large body size (`--pf-t--global--font--size--body--lg`, 16px). The viewport never blocks zoom: people can still pinch to zoom.
- **Conversations and their history.** Asking about an object always starts a new conversation, and so does New conversation; a conversation not yet begun is reused rather than kept empty. Earlier conversations are kept, newest first, in the chat's history, PatternFly's conversation history drawer, opened from a Conversations button at the start of the header. Each is named for its object, its identifier and title, or for a general one, its first question, or "New conversation" until one is asked. The history has New conversation and a search that narrows it by name. Choosing one restores it, its object's card read again, so its state and methods are current. The history belongs to the person: another person chosen in Profile sees only their own, and it is kept for the session, never stored on the device or the server (platform spec 9). The earlier turns of a conversation go with each question in it, so a follow-up such as "and which of those are overdue?" is understood (platform spec 5.2).
- **The search page** (`#/search/…`), opened from the chat, asks the gateway the same way and shows the answer, or who understood the query, "Understood by" the model or "Understood from the ontology", then how, as labels such as "Type: Safety Case", "Seriousness: serious" and "Yours", then the results as cards like an object list: identifier, type, state, why it matched, and the methods the person can run now. With no match, it says so and suggests fewer words.

**Process dock.** Processes the person has set aside wait in a dock along the bottom of the page, the platform chrome's footer. It is shown only while there is something in it.

- The dock's heading, "Set aside", has the large spacer above it, more than the space below it, so it never crowds the dock's top edge.
- Each process is one entry: the method and the object, a small progress bar, and its progress in words, such as "2 of 3 fields", "Ready to sign", "Running, 40%" or "Draft ready". Choosing an entry brings the process back in front; the process in front, if any, goes into the dock. A process in a modal covers the page, dock included, so the person minimizes it before choosing another; a page process leaves the dock in reach.
- Each entry has a close button, named for the process. Closing ends it without committing anything; a background run keeps running, and an undecided draft stays undecided.
- The entries sit in one row that scrolls sideways inside the dock when they do not fit, so the page itself never scrolls sideways.
- The dock is kept on the device for each person, like the appearance setting, until each process is finished or closed, and moves to their user context when identity exists. A typed signature is never kept: signing always starts fresh.

Settings opens a menu. For now it holds one setting, Appearance (section 4.2).

Notifications opens the notification drawer, PatternFly's Notification drawer over the content. Its button is a plain icon button like Settings and Profile, with no frame; a badge on it shows the number of unread notifications, and its accessible name says how many are unread. The drawer lists the person's notifications, newest first, each with its status icon, title, what it is about and when it came. Choosing one marks it read, and Mark all read clears the count. On phones the drawer takes the full width. New notifications appear without a reload.

Profile opens a menu showing who the person is and the role they act in, and, where people sign in, the signed-in account and Sign out. In development, in previews and in a demo deployment it also lists the graph's people, to act as any of them, labeled as a development or demo tool; elsewhere it lists only the person's own roles. Choosing another person or role opens their Home, whatever page was showing, since it may not apply to them; choosing the one already acted as changes nothing.

**Signing in.** Where the deployment connects sign-in (platform spec 3.4, Identity), a person who is not signed in sees PatternFly's Login page instead of the chrome: the product name, "Sign in to continue", and a primary button, "Sign in with Google", which goes to the provider. A refusal after signing in, such as an account the deployment does not allow, is an inline danger alert on the same page with the gateway's reason, and a Sign out link. When a session ends, the next request brings the person back to it.

### 4.3 To do and object lists

To do, the list of a type's objects and the search page are object lists (pattern `card-view`), composed as view specs and drawn by the renderer. Each shows its objects as cards or as a list, the person's choice. Each card leads with the object's identifier and type in small text, such as "AE-005 · Adverse Event", then its title from the ontology as the card's heading, such as "Fever and cough; admitted to hospital with pneumonia". Then its state as labels, its deadline and urgency as status labels (a deadline to come as a warning, "Due", and one already past as a danger, "Overdue since"), and, on To do, the tasks waiting. Running a task from a card comes with the Compose step.

- On a type's list, each card also shows the methods the person can run on the object now, as buttons under "You can:". This is how a person reaches on-demand methods, such as running an analysis, on objects that are not on To do.
- An object with a background run that has not ended shows a status label naming the method and saying it is running.

**The list bar** is a low, quiet Toolbar above the objects, after Gmail's: a selection control at its start, the actions for what is chosen beside it only while something is, and the view controls at its end. It stays in view while the list scrolls. Its shadow shows only once the list has scrolled under it; at the top of the list, unscrolled, the bar has no shadow. When the person may create objects of the listed type (platform spec 5.3, Creating and editing objects), the bar's end offers it before the view toggle, while nothing is chosen: New and the type, such as New Study Scenario, as a secondary button; in a tab of objects the object contains, Add and the type, creating the new object inside it. Its controls are quiet: plain icon and text buttons, and the Select and Done links.

- **Selection control.** PatternFly's bulk select: a checkbox split with a small menu.
  - The checkbox shows none, some or all of the listed objects chosen. Choosing it chooses every object when none is chosen, and none otherwise.
  - Beside it, how many are chosen, such as "3 selected".
  - Its menu offers Select all, with how many there are, and Select none.
- **At its end,** a compact toggle between Cards and List, as icon buttons with those names. The choice is kept on the device and applies to every object list.
- **Cards.**
  - Before selecting, the bar's start holds one Select link, the word "Select". Choosing it starts select mode: each card shows its select control, and the bar shows the same selection control and batch actions as List, and a Done link at the bar's end, before the view toggle and apart from the actions, that ends select mode and clears the choice. Once in select mode, Cards and List work the same way.
  - In select mode, each card shows a round select control at its top right: an empty circle, or a green check when chosen. It is a checkbox named "Select" and the object's title.
  - Choosing anywhere on a card, except its buttons, chooses it, rather than opening it. The card's title still opens the object.
  - A chosen card's border shows it is chosen, as well as its check.
- **List.** A table, PatternFly's Table. The selection control is always there.
  - Columns, in order: a checkbox, named "Select" and the row's identifier; Identifier; Title, a button that opens the object; Type, only when the list holds more than one type; Attention, the status labels (deadline, urgency and runs in progress), shown only when some listed object has one, and named so it never clashes with a state dimension named Status; then one column per state dimension the listed objects have, headed by the dimension's name, such as Workflow or Causality, with each value in plain text, and empty where the object's type has no such dimension; and last the row's actions.
  - The lifecycle dimension comes first among the state columns, then the rest by name.
  - Actions: a column pinned to the end of the row, behind a thin border, so it stays in view while a wide table scrolls under it; on phones, below md, it scrolls with the row, since pinned it would hide most of it. One method raised to the row, the first task waiting or else the first method available, and the rest in a "…" menu, named "More actions for" the object's identifier.
  - Cells keep their content on one line, with PatternFly's default, roomy cell padding, on the content area's white table surface. When the table is wider than the content area, it scrolls sideways inside itself; the page never does. It stays a table on phones.
- **Set actions.** Once objects are chosen, in either view, a thin divider follows the selection control. First come the set methods the selection qualifies for (platform spec 5.4, Acting on a set), each a plain text button named by the method, such as Compare study scenarios. A set action opens its archetype's pattern once for the selection as a whole, as a modal titled with the method and how many objects; a large modal for a comparison, so three or four cards fit side by side. Choosing a set that does not qualify, such as one object or alternatives from different parents, offers no set action, and nothing explains why unless the person asks.
- **Batch actions.** After any set actions come the methods every chosen object has available that run for many (platform spec 5.4), as plain text buttons. The first three are shown; the rest are in a "…" menu named "More actions for the selected". When none applies to all of them, there are none and nothing says so: Ask about the chosen follows the divider alone.
  - A batch action opens its archetype's pattern once for all the chosen objects. The modal names the method and how many objects.
  - **Together** (every input shared, platform spec 5.4): the modal gives the inputs once, then previews each object, naming any the gateway would refuse with its reasons. Objects whose changes are the same are shown once, under all their identifiers.
  - **One after another** (some input about each object): a Wizard in the modal, one step per object named by its identifier, then Review. A step called "For all of them" comes first when there are shared inputs. Each object's step shows its title, its own inputs and its own preview, or why the gateway would refuse it; Next is enabled once its inputs are given, or straight away when it will be left out. Review lists every object with its own changes and the ones left out, and its button commits them, in order.
  - In either way, a new object a batch will create is named by its type, such as "a new Safety Case": each object is previewed alone, so its identifier is given only at commit.
  - Commit runs only the objects that would succeed, one commit each.
  - The outcome names each object, those changed and those refused, and the choice is cleared.
  - A batch is not set aside in the dock.
- **Ask about the chosen.** Last among the actions for what is chosen, after the set and batch actions and their … menu, the Ask speech bubbles, named "Ask about the" and how many, such as "Ask about the 3 selected". Anticipation first: the set and batch actions are what the platform anticipates, so they come first, and Ask is the free-text way forward for the chosen objects when none of them fits, including when no action applies to all of them. It opens the chat on a conversation about them (4.1, About the chosen).

**Home** (platform spec 5.1, Home) is each person's homepage, in this order under the greeting: Your world, then Where things stand, then Your work with the To do summary and list. Every section is drawn the same way for every role; only the ontology's metrics and the person's types differ.

- **Your world.** Under the heading "Your world", one tile per metric the person's roles watch, in a gallery: two to a row on phones, four from md up. Each tile is a card with the metric's name, its count large, "of" the type's total in small text beneath when that helps, and its health as a status label with its icon: On track (success), Watch (warning) or At risk (danger). An information-only metric has no label. Status colors are never used for anything else on Home, and the label's word always goes with its color, so health is never told by color alone. When the metric counts any objects, the whole tile is clickable and opens them on a page of their own, with its title as the link, so it can be reached by keyboard and opened in a new tab; a tile that counts nothing is not clickable. The page shows the metric's name as the page's heading, its description and its health under it, then the objects as an object list (4.3). The page has an address of its own, so it can be bookmarked and shared.
- **Where things stand.** Under the heading "Where things stand", one row per type: its plural name and total, then a thin segmented bar of its objects by lifecycle stage, then the stages as text, each with a small circle in its stage's color, its name and count, close under the bar (4.5), such as "draft 3 · in review 1". The bar runs the chart blue ramp from the first stage, step 100, to the last; in dark mode its own steps, from the same ramp against the dark surface. Segments are separated by a 2px surface gap, and the text beside the bar carries every figure, so the bar is never read by color alone. Each bar is an accessible chart, named for its type with its figures in its description. All the bars share one scale, from zero to the largest total, so rows compare. The legend's markers are circles, never squares, so they are not mistaken for the bar's segments.
- **Your work.** Under the heading "Your work", the To do summary tiles, then a line on keeping up: what the person has done in the last 7 days, such as "You've done 4 things in the last 7 days; 1 item is overdue." Then the To do list.

**The greeting.** Home opens with a greeting as its main heading, in place of the word "Home": the time of day and the person's first name, for whoever is chosen in Profile, such as "Good morning, Chloé". The sidebar and the page's landmark still name the page Home. Under it, one line says how much is waiting and for which role: "3 items need you as Drug Safety Physician. Nearest deadline first, then the most urgent.", or "Nothing needs you as Drug Safety Physician right now."

- The time of day comes from the person's own clock: morning from 5:00, afternoon from 12:00, evening from 17:00, and late night from 22:00.
- Each part of the day has a few greetings, plain or playful, such as "Good evening, Chloé", "Winding down, Chloé?" or "Burning the midnight oil, Chloé?". Some fit a day of the week: "Happy Monday" on a Monday morning, "Happy Friday" on a Friday afternoon, "Weekend shift" on a Saturday or Sunday.
- Which one shows is chosen by the date, so a part of the day keeps the same greeting all day, and the next day may bring another. It changes only when the part of the day does, never at random while the person works.
- The greeting is the same in every domain: it names no object or domain.

**The To do summary** sits above the list, under the heading "Your work", with the standard gutter between the heading and the tiles, as between any section heading and its content. Four count tiles: waiting, urgent, due within 7 days and overdue, each a number with its name. They are selectable cards that work like one set of radio buttons: choosing urgent, due or overdue narrows the cards to those items, and choosing waiting shows them all again. Two tiles to a row on phones, four from md up.

### 4.4 The object panel

Every object opens in a side panel (platform spec 5.1, Within an object). It is the Choose step's primary-detail pattern: PatternFly's Drawer, its panel over the content area.

- **Opening.** A click anywhere on a card opens its object, except on the card's buttons. The card's title is also a button, so keyboard and screen reader users open it the same way. Cards and linked objects inside the panel open the same way, and so do search results.
- **Size.** The panel slides in from the right and takes three quarters of the content area from lg up, and all of it below. From lg up, Expand widens it over everything below the masthead, the sidebar too, so the person never chooses a destination whose content the panel hides; Restore returns it to three quarters and brings the sidebar back, and so does opening the sidebar with the menu button. As in Notion, an object opened from a card, a row, a link or a search result always opens at three quarters, as a peek, whatever size the panel last had; Expand lasts while the person moves in and back through the panel, until it closes. The masthead and the process dock stay in reach, and at three quarters, so do the sidebar and the cards behind the panel: choosing another card opens that object in its place.
- **Top bar.** Back, a left arrow named "Back to" the previous object's identifier, once the person has moved in. Expand or Restore. Close, an X at the top right, which closes the whole panel; Escape does too. Focus moves to the object's heading as the panel opens, and back to the card that opened it as the panel closes.
- **Moving in.** Opening a related object slides the current one out to the left as the new one slides in from the right. Back reverses it. The slide is timed by PatternFly's motion tokens; with reduced motion asked for, the content changes without moving.
- **Header.** The identifier and type in small text, the title as the panel's heading, the state as labels, the deadline and urgency as status labels, and the methods the person can run now as buttons, then Edit as a secondary button when the person may edit the object now. Running one opens its process as from a card. While a page pattern, such as Compare and decide, is in front, the panel steps aside; after any commit it shows the object as it now is.
- **Tabs** (pattern `object`) under the header: Overview, then one tab per relationship end that holds many objects, each with its count, contained objects first. On phones the tabs scroll sideways.
  - **Overview.** The properties as a description list. Then Linked, the ends that hold at most one object, each named by the type at its other end, such as Study, or by its relationship when two reach the same type or it reaches the object's own type, such as "Duplicate of", with a link to the object or None. Then the type, its domain and the last change: the method, who ran it and when.
  - **Each other tab** says what the relationship means from here, such as "This study enrolls these patients.", then lists the objects as an object list like any other (4.3): the list bar, with selection, batch actions and the choice of cards or a list, then the objects, each with the methods the person can run on it. Or it says there are none yet.

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

### 4.5 Spacing and grouping

Space is how a page shows what belongs together. Three distances do the work, and every view uses them the same way, so a person can tell at a glance which things are one group, which are peers, and where a new section starts.

| Distance | Size | Where |
|---|---|---|
| **Group** | 8px (4px for a title and its summary) | The parts of one thing: a heading and what it holds, a name and its bar and legend, a count and its total |
| **Peers** | 16px, PatternFly's gutter | Things of equal rank in one section: cards in a gallery, items in a stack, tiles in a grid |
| **Section** | 32px | One section from the next: the greeting from Your world, Your world from Where things stand, an overview's Details from its Linked, a dialog's fields from What will change |

- **Nearer what it heads.** A heading is always closer to the content it introduces than to whatever came before it, by at least two to one. Section spacing is larger than group spacing so the heading reads as the start of something, never as a label for the section above.
- **A legend belongs to its bar.** In Where things stand, a row's name, bar and legend are one group, close together, and the rows are peers set 32px apart, so a legend is never nearer the next row's name than its own bar.
- **Aligned along a row.** Where tiles sit in a row, the same things sit at the same height. A metric tile's count and total are at the top and its health label is pinned to the tile's foot, so the labels of a row line up however many lines each name takes.
- **Optical alignment.** An icon-only button that starts a row, such as Ask on a card with no method buttons, is pulled left so its glyph lines up with the text above it, and its own padding adds no height to the card.
- **Fair targets.** Checkboxes and radio buttons in a form are in rows at least 32px tall with 4px between, so each can be tapped without catching its neighbor. Every interactive target is at least 24px, as WCAG 2.2 requires.

On phones, from 320px:

- **Wrap, never clip.** A dialog's title wraps onto the next line; its buttons wrap rather than squeeze, so a button's label always has its padding. A list bar's controls wrap onto another row; "3 selected" is never broken in two or cut off, in the object panel beside an open chat as much as on a phone. The bar measures its own width, not the screen's: when narrow it drops the thin divider after the selection control, which would be left stranded at the end of a row, and while objects are chosen it leaves out New and Add, so it is never more than it needs to be.
- **Radio buttons stack**, one to a row, rather than wrapping raggedly side by side.
- **The masthead keeps the page's 16px gutter**, so its menu button lines up with the content below, and the product name has the room to wrap onto two lines without being cut.
- **Menus keep an even margin** to the screen's edge on both sides.
- **No page scrolls sideways.** Wide content, such as a table, scrolls inside its own container.
- The object panel's top bar is a thin band, with the object starting directly beneath it.

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
| Compare and decide | Page; a modal for a set | The objects side by side as cards, differences marked; they stack on phones. For a set, the comparison's rows first, such as each alternative's forecasts against their targets, a missed target marked as a warning; then the other differences. The decision, then the preview |
| Review a draft | Page | The draft, marked as generated until accepted (rule 5); Accept, Edit and Discard |
| Review and sign | Wizard | A review step with the preview, then a signature step showing the signer, the time and the meaning of the signature |
| Start and track | Modal, then the object | Confirm the start; progress then shows on the object, and Notifications tells the person when it ends |

**Creating and editing** open as Fill in, a medium modal titled New and the type, or Edit and the object's identifier. The required fields come first, marked as required, then the optional ones under the heading Optional. Editing starts with the object's current values. The preview lists what will be created or what will change, and the button says Create or Save.

**Fields come from the inputs.** Each input's kind decides its field: text gives a text area, a value from a concept scheme gives radio buttons side by side for up to five values, so each has room to be tapped, and a select beyond that, an input that takes many values from a scheme gives a group of checkboxes, one per value, stacked so each label reads in full, a person gives a select of people that defaults to the person acting, an object gives a searchable list, and a web address gives a URL field.

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
- A Checkbox with a `field` and a `value` is one of a set: its field holds the chosen values separated by spaces, and checking or clearing it adds or removes its value.

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
| 0.29 | 2026-11-14 | Card view's select mode starts from a Select link and ends with a Done link; between them the bar is the same as List's. |
| 0.30 | 2026-11-14 | A batch runs together, or one after another as a Wizard with a step per object and a Review, when some input is about each object. |
| 0.31 | 2026-11-15 | The search field takes a search or a question, "Search or ask". The search page leads with the model's answer in a card, with the objects it cites as links and then as an object list; an answer that asks for more, or cannot be given, is an info alert. |
| 0.32 | 2026-11-15 | On touch screens, text fields use the large body size, 16px, so phones do not zoom in when one takes focus. Pinch zoom stays. |
| 0.33 | 2026-11-15 | To do opens with a greeting for the person chosen in Profile, by time of day and first name, chosen by the date so it holds all day, with a line saying how much waits for them and in which role. |
| 0.34 | 2026-11-15 | The masthead's search field becomes an Ask button, a pair of speech bubbles, that opens a chat panel built from PatternFly's chatbot: docked at the right beside the page from lg up, over it below lg and full screen on phones. It holds one conversation per person, answers with the objects cited as sources, falls back to search with a link to the search page, and starts agentic sessions in time. |
| 0.35 | 2026-11-15 | The chat panel follows the visual style: a chrome panel with a header lined up with the masthead, the conversation on the inset content surface, the person's messages and cards on the card surface with the card shadow, the welcome set as To do's heading, and the message bar as a standard field. No brand-colored fills, borders or floating shadow. |
| 0.36 | 2026-11-15 | The chat's welcome is its own, "Search or ask anything", not To do's greeting. Ask about this: a speech-bubble button on every card, list row and object panel starts a conversation about that object, led by its card with its methods, with prompts and a message bar about it. The view spec gains `asks`. |
| 0.37 | 2026-11-15 | Every Ask about this, and New conversation, starts a new conversation; earlier ones are kept, newest first, in the chat's conversation history drawer, named for their object or first question, searchable, and restored when chosen. The history is the person's own and kept for the session only. |
| 0.38 | 2026-11-15 | Signing in: PatternFly's Login page with Sign in with Google, a refusal shown on it; Profile shows the signed-in account and Sign out, and the persona switcher only in development, previews and demo deployments. |
| 0.39 | 2026-11-16 | Anticipation first: on cards and list rows, Ask about this follows the method buttons, last in their row, as the free-text way forward when the anticipated methods miss. It leaves the card's header. |
| 0.40 | 2026-11-16 | On list rows, Ask about this sits at the right end of the actions column, so it lines up down the list, still after the methods. |
| 0.41 | 2026-11-16 | The object panel's tabs list their objects as object lists like any other, with the list bar and the choice of cards or a list. Expanding the panel covers the sidebar too, so a destination is never chosen behind it; Restore, or opening the sidebar, brings the sidebar back. An object opened from the page always opens at three quarters, as in Notion; Expand is no longer kept on the device. |
| 0.42 | 2026-11-20 | An input that takes many values from a scheme gives a group of checkboxes; a Checkbox bound to a field adds or removes its value. |
| 0.43 | 2026-11-20 | Set actions in the list bar, before batch actions: the set methods the selection qualifies for, each opening its pattern once for the whole selection. Compare and decide over a set: the objects as columns, the comparison's rows first. |
| 0.44 | 2026-11-20 | The list bar's shadow shows only once the list has scrolled under it. |
| 0.45 | 2026-11-20 | New and Add at the end of the list bar, Edit in the object panel's header, and the create and edit form: required fields first, then Optional, as Fill in. |
| 0.46 | 2026-11-20 | Home replaces To do as each person's homepage: Your world (metric tiles with health), Where things stand (a thin segmented lifecycle bar per type, figures beside it, one shared scale), then Your work (the To do summary, keeping up, the list). |
| 0.47 | 2026-11-21 | A metric tile links to its objects, on a page of their own under the metric's name, description and health. |
| 0.48 | 2026-11-21 | Ask about the chosen: once objects are chosen in a list, the list bar ends with the Ask speech bubbles, after the set and batch actions, opening a conversation about all of them, led by a compact card for each, up to ten. |
| 0.49 | 2026-11-21 | When no batch action applies to all the chosen objects, the list bar no longer says so; Ask about the chosen stands alone after the divider. |
| 0.50 | 2026-11-21 | Where things stand: the legend's markers are small circles, not squares, so they are not mistaken for the bar's segments. |
| 0.51 | 2026-11-21 | Your world: a metric tile that counts objects is clickable as a whole, its title the link, in place of a View link. |
| 0.52 | 2026-11-21 | Profile: choosing another person or role opens their Home, so no one is left on a page that does not apply to them. |
| 0.53 | 2026-11-21 | Spacing and grouping (new section 4.5): three distances, group, peers and section, so headings sit nearer what they head; a legend close to its bar; metric tile labels aligned along a row; optical alignment of a lone icon button; fair targets for checkboxes and radios. On phones, wrapping instead of clipping: dialog titles and buttons, list bars, the product name over two lines, even menu margins, stacked radios, a thin object panel head; a list bar that drops its stranded divider and its New and Add while objects are chosen; denser cards in the chat for the chosen. |
| 0.54 | 2026-11-21 | Brand logo (4.1): a branded deployment's masthead shows the parent brand's own mark and wordmark as approved image files named in configuration, with light and dark variants, never redrawn or retyped, falling back to the product name as text when none are configured or a file cannot load. |
| 0.55 | 2026-11-21 | Brand logo (4.1): the brand's own mark as an image, cut from its combined logo file with its paths unchanged, then the product's short name as live text in the platform's typeface, since the brand's lettering has no H or &. The accessible name is the full product name. |
| 0.56 | 2026-11-21 | Brand logo (4.1): one image, the brand's mark with the product's short name in the brand's lettering, as supplied; viewBox cropped, paths unchanged, with a reversed copy for dark mode. It replaces the mark-and-text lockup of 0.55. |
