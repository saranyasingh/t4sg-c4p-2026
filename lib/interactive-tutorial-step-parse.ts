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
    // The ONLY supported targeting field is `highlightDescription`, which
    // routes through the Claude Computer Use API. Any other targeting key
    // the model might emit (CSS selector, fixed coordinates, etc.) is
    // silently ignored at parse time.
    const highlightDescription =
      typeof parsed.highlightDescription === "string" ? parsed.highlightDescription : undefined;

    const allowHighlight = visual !== "text";

    return {
      id: parsed.id,
      titleRaw: typeof parsed.titleRaw === "string" ? parsed.titleRaw : undefined,
      text: "interactive.step",
      textRaw,
      visual,
      highlightDescription: allowHighlight ? highlightDescription : undefined,
    };
  } catch {
    return null;
  }
}
