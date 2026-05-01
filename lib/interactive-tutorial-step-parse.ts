import type { TutorialStep } from "@/lib/tutorials";

/** Parse one tutorial step JSON from an Anthropic Messages API `content` array. */
export function extractStepFromAnthropicContent(content: unknown): TutorialStep | null {
  if (!Array.isArray(content)) return null;
  const textBlocks = content
    .filter((b) => b && typeof b === "object" && (b as any).type === "text" && typeof (b as any).text === "string")
    .map((b) => (b as any).text as string);
  const joined = textBlocks.join("\n").trim();
  if (!joined) return null;

  const m = joined.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as Partial<TutorialStep> & { titleRaw?: string; textRaw?: string };
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.id !== "string") return null;
    const visual = parsed.visual;
    if (visual !== "text" && visual !== "screen" && visual !== "screen_text") return null;
    const textRaw = typeof parsed.textRaw === "string" ? parsed.textRaw : null;
    if (!textRaw) return null;
    const highlightSelector = typeof parsed.highlightSelector === "string" ? parsed.highlightSelector : undefined;
    const highlightDescription =
      typeof parsed.highlightDescription === "string" ? parsed.highlightDescription : undefined;

    const allowHighlight = visual !== "text";

    return {
      id: parsed.id,
      titleRaw: typeof parsed.titleRaw === "string" ? parsed.titleRaw : undefined,
      text: "interactive.step",
      textRaw,
      visual,
      highlightSelector: allowHighlight ? highlightSelector : undefined,
      highlightDescription: allowHighlight ? highlightDescription : undefined,
      highlightBright: Boolean((parsed as any).highlightBright),
    };
  } catch {
    return null;
  }
}
