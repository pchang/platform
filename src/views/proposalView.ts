import type { ViewNode } from "../design-system/catalog";
import type { ProposalView, SkillProposals } from "../data/client";
import { group } from "./layout";

/**
 * Proposals from skills (platform spec 3.3, Skills; design system spec 4.3, Proposals from skills): the group that leads
 * a method's dialog with what a skill proposes, and the values it pre-fills.
 */

export type ProposalState =
  | { status: "none" }
  | { status: "working" }
  | { status: "ready"; result: SkillProposals }
  | { status: "failed"; reasons: string[] };

const text = (
  label: string,
  component?: "p" | "small",
  isSubtle = false,
): ViewNode => ({
  component: "Content",
  props: {
    label,
    ...(component ? { component } : {}),
    ...(isSubtle ? { isSubtle } : {}),
  },
});

/** How a proposal ran, in small text: its version and the model's name or "reference procedure". */
export function ranByLine(p: ProposalView): string {
  const how = "model" in p.ranBy ? p.ranBy.model : "reference procedure";
  return `Version ${p.version} · ${how}${p.fellBack ? `. ${p.fellBack}` : ""}`;
}

/** The proposal whose values a commit starts from: the first that proposes any. */
export function leadingProposal(
  state: ProposalState,
): ProposalView | undefined {
  return state.status === "ready"
    ? state.result.proposals.find((p) => p.values.length)
    : undefined;
}

/** The proposal's values for the fields the person has left empty: a value they already gave is never overwritten. */
export function fillEmpty(
  values: Record<string, string>,
  proposal?: ProposalView,
): Record<string, string> {
  if (!proposal) return values;
  const filled = { ...values };
  for (const v of proposal.values)
    if (!filled[v.name]?.trim()) filled[v.name] = v.value;
  return filled;
}

/** While a proposal is worked out: a small spinner and a line, where the group will be. */
const working: ViewNode = {
  component: "Flex",
  props: {
    gap: { default: "gapSm" },
    alignItems: { default: "alignItemsCenter" },
    flexWrap: { default: "nowrap" },
  },
  children: [
    {
      component: "Spinner",
      props: { size: "md", "aria-valuetext": "Working out a proposal" },
    },
    text("Working out a proposal…", "small"),
  ],
};

/** Why a skill proposed nothing, as one quiet line. */
const quiet = (lines: string[]): ViewNode[] =>
  lines.map((l) => text(l, "small", true));

/**
 * The Proposed group: "Proposed by" the skill, its version and how it ran, its reasoning, then each value with the objects
 * it rests on. Undefined when there is nothing to show.
 */
export function proposedSection(state: ProposalState): ViewNode[] | undefined {
  if (state.status === "none") return undefined;
  if (state.status === "working") return [working];
  if (state.status === "failed")
    return quiet([`No proposal: ${state.reasons.join(" ")}`]);
  const { proposals, notRun } = state.result;
  const shown = proposals.filter((p) => p.values.length);
  if (!shown.length)
    return notRun.length || proposals.length
      ? quiet([
          ...notRun.map((n) => `${n.label} proposed nothing. ${n.reason}`),
          ...proposals.map((p) => p.reasoning),
        ])
      : undefined;
  return shown.flatMap((p) => {
    // When every value rests on the same objects, they are named once, beside how the proposal ran.
    const sourcesOf = (v: ProposalView["values"][number]) =>
      v.restsOn.map((r) => r.identifier).join(", ");
    const shared = p.values.every(
      (v) => v.restsOn.length && sourcesOf(v) === sourcesOf(p.values[0]),
    )
      ? sourcesOf(p.values[0])
      : undefined;
    return [
      group([
        {
          component: "Title",
          props: {
            label: `Proposed by ${p.label}`,
            headingLevel: "h2",
            size: "md",
          },
        },
        text(
          `${ranByLine(p)}${shared ? ` · from ${shared}` : ""}`,
          "small",
          true,
        ),
        text(p.reasoning),
        {
          component: "DescriptionList",
          props: { isCompact: true, isHorizontal: true, termWidth: "20ch" },
          children: p.values.map((v) => ({
            component: "DescriptionListGroup",
            children: [
              { component: "DescriptionListTerm", props: { label: v.label } },
              {
                component: "DescriptionListDescription",
                children: [
                  {
                    component: "Flex",
                    props: {
                      gap: { default: "gapSm" },
                      flexWrap: { default: "wrap" },
                      alignItems: { default: "alignItemsBaseline" },
                    },
                    children: [
                      text(v.valueLabel),
                      ...(v.restsOn.length && !shared
                        ? [
                            text(
                              `from ${v.restsOn.map((r) => r.identifier).join(", ")}`,
                              "small",
                              true,
                            ),
                          ]
                        : []),
                    ],
                  },
                ],
              },
            ],
          })),
        },
      ]),
    ];
  });
}

/** The recommendation a recommending skill made, if any, for the set's cards and the choice. */
export function recommendationOf(
  state: ProposalState,
): ProposalView | undefined {
  return state.status === "ready"
    ? state.result.proposals.find((p) => p.recommended || p.reasoning)
    : undefined;
}

/** The Recommendation group of Compare and decide: the skill's reasoning, between Side by side and Decide. */
export function recommendationSection(
  state: ProposalState,
): ViewNode[] | undefined {
  if (state.status === "none") return undefined;
  const heading: ViewNode = {
    component: "Title",
    props: { label: "Recommendation", headingLevel: "h2", size: "md" },
  };
  if (state.status === "working") return [heading, working];
  if (state.status === "failed")
    return [
      heading,
      ...quiet([`No recommendation: ${state.reasons.join(" ")}`]),
    ];
  const p = recommendationOf(state);
  if (!p)
    return state.result.notRun.length
      ? [
          heading,
          ...quiet(
            state.result.notRun.map(
              (n) => `${n.label} could not run. ${n.reason}`,
            ),
          ),
        ]
      : undefined;
  return [
    heading,
    text(`${p.label} · ${ranByLine(p)}`, "small", true),
    text(p.reasoning),
    ...(p.recommended
      ? [
          text(
            "The choice below starts with the recommendation. The decision and its rationale are yours.",
            "small",
            true,
          ),
        ]
      : []),
  ];
}
