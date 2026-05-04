"use client";

import { toast } from "@/components/ui/use-toast";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { INTRO_TUTORIAL_ID } from "@/lib/tutorials";
import { clientSideRecoveryHint } from "@/lib/chat-assistant-error";
import { useTutorial } from "./tutorial-provider";

/**
 * Sleek, minimal chat box that sits directly under the tutorial step card
 * during ANY active tutorial (App Tour, Google Search, Gmail, interactive
 * AI tutorial). The right-side GransonAI panel is collapsed off-screen
 * whenever a tutorial is running, so this chat box is the only way the
 * user can ask questions during a lesson.
 *
 * Design intent:
 * - A single slim input with a soft border and a gray "Ask a question..."
 *   placeholder. Pressing Enter sends; there is no separate Send button.
 * - The AI's reply is rendered INSIDE the tutorial step card:
 *     · For the interactive AI tutorial, the reply IS the next tutorial step
 *       (existing flow via `sendInteractivePrompt` -> `addInteractiveStep`).
 *     · For hand-authored tutorials, the reply overlays the current step via
 *       `tutorialChatOverride` in the provider. Navigating Back/Next clears
 *       the overlay and restores the original step content.
 *   In neither case do chat bubbles appear next to the chat box.
 */
export function InteractiveChatBar() {
  const { t } = useTranslation();
  const { tutorialId, askTutorialQuestion, isAskingTutorialQuestion } =
    useTutorial();

  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const prompt = text.trim();
      if (!prompt || isLoading) return;
      setText("");
      setIsLoading(true);
      try {
        await askTutorialQuestion(prompt);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Could not reach the assistant.";
        const recovery = clientSideRecoveryHint(reason, t) ?? t("chat.errorRecoveryDefault");
        toast({
          title: t("chat.assistantUnavailable", { status: "interactive" }),
          description: t("chat.errorWithDetail", { detail: reason, recovery }),
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [askTutorialQuestion, isLoading, t, text],
  );

  // Reflect the provider's "asking" state in the local loading state so the
  // input + voice button properly disable while the answer is being fetched.
  const effectiveLoading = isLoading || isAskingTutorialQuestion;

  if (!mounted) return null;
  // Render for any active CONTENT tutorial. The App Tour keeps the GransonAI
  // panel visible (the chatbot stays "on the side" inside the panel), so we
  // don't render a duplicate floating chat box on top.
  if (!tutorialId) return null;
  if (tutorialId === INTRO_TUTORIAL_ID) return null;
  // For the interactive AI tutorial: render even before the first step arrives
  // so the user has a place to interact while the tutorial is starting up. The
  // tutorial step card itself shows a "Setting up your tutorial..." placeholder
  // during that window — both pieces of UI come up together.

  return createPortal(
    <div
      data-tutorial-chrome
      className="interactable fixed z-[1000004]"
      style={{
        // Anchor the chat box to the bottom-left, sitting directly under the
        // tutorial step card (which ends at bottom: 116). Keep it the same
        // width as the step card so they read as a clean vertical stack.
        left: 16,
        bottom: 64,
        width: 420,
        maxWidth: "92vw",
      }}
    >
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-[hsl(var(--foreground)/0.92)] pl-2 pr-2 py-1 text-white shadow-lg backdrop-blur-md"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={effectiveLoading}
          placeholder="Ask a question..."
          aria-label="Ask a question"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!effectiveLoading && text.trim()) {
                void handleSubmit();
              }
            }
          }}
          className="interactable flex-1 bg-transparent px-1 py-1 text-sm text-white placeholder:text-white/40 focus:outline-none"
        />
      </form>
    </div>,
    document.body,
  );
}
