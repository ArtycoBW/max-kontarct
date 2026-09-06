import type { ContractStructuredDraft } from "@max-contract/contracts";

/** Model output is plain text in both the app and PDF; never edit the source conditions here. */
export function normalizeContractDraft(
  draft: ContractStructuredDraft,
): ContractStructuredDraft {
  const plain = (value: string) =>
    value
      .split("\n")
      .filter((line) => !/^\s*typeSectionTitle\s*:\s*$/u.test(line))
      .map((line) =>
        line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^\s*#{1,6}\s+/u, ""),
      )
      .join("\n")
      .trim();
  const unnumber = (value: string) => value.replace(/^\d+(?:\.\d+)*[.)]\s+/u, "");
  const sections = draft.sections
    .map((section) => {
      const heading = unnumber(plain(section.heading));
      return {
        heading,
        clauses: section.clauses.map(value => {
          const lines = plain(value).split("\n").map(line => unnumber(line.trim())).filter(Boolean);
          return lines.filter(line => lines.length === 1 || line.replace(/[.:]$/u, "") !== heading.replace(/[.:]$/u, "")).join("\n");
        }).filter(Boolean),
      };
    })
    .filter((section) => section.heading && section.clauses.length);
  if (sections.length < 3) throw new Error("CONTRACT_DRAFT_EMPTY_SECTIONS");
  return {
    ...draft,
    title: plain(draft.title),
    preamble: plain(draft.preamble),
    warnings: draft.warnings.map(plain).filter(Boolean),
    sections,
  };
}
