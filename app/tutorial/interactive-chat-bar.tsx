"use client";

import { toast } from "@/components/ui/use-toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { VoiceInput } from "@/app/chat/voice-input";
import { useAudioMode } from "@/app/audio-mode-context";
import { INTRO_TUTORIAL_ID } from "@/lib/tutorials";
import { useTutorial } from "./tutorial-provider";

/**
 * Sleek, minimal chat box that sits directly under the tutorial step card
 * during ANY active tutorial (App Tour, Google Search, Gmail, interactive
 * AI tutorial). The right-side GransonAI panel is collapsed off-screen
 * whenever a tutorial is running, so this chat box is the only way the
 * user can ask questions during a lesson.
 *
 * Design intent:
 * - "Literally just a chat box" — a single slim input with a soft border, a
 *   gray "Ask a question..." placeholder, and a small voice mic on the left.
 *   Pressing Enter sends; there is no separate Send button.
 * - The AI's reply is rendered INSIDE the tutorial step card:
 *     · For the interactive AI tutorial, the reply IS the next tutorial step
 *       (existing flow via `sendInteractivePrompt` -> `addInteractiveStep`).
 *     · For hand-authored tutorials, the reply overlays the current step via
 *       `tutorialChatOverride` in the provider. Navigating Back/Next clears
 *       the overlay and restores the original step content.
 *   In neither case do chat bubbles appear next to the chat box.
 * - Voice INPUT works via the shared `VoiceInput` component (mic toggle).
 * - Voice OUTPUT: when audio mode is on, the new step / overlay's body is
 *   spoken through `/api/speak`.
 */
export function InteractiveChatBar() {
  const { t } = useTranslation();
  const { tutorialId, currentStep, askTutorialQuestion, tutorialChatOverride, isAskingTutorialQuestion } =
    useTutorial();
  const { audioModeEnabled } = useAudioMode();

  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const audioModeRef = useRef(audioModeEnabled);
  audioModeRef.current = audioModeEnabled;

  const speechAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechObjectUrlRef = useRef<string | null>(null);
  const lastSpokenStepIdRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const stopAnyPlayback = useCallback(() => {
    if (speechAudioRef.current) {
      try {
        speechAudioRef.current.pause();
      } catch {
        /* ignore */
      }
      speechAudioRef.current = null;
    }
    if (speechObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(speechObjectUrlRef.current);
      } catch {
        /* ignore */
      }
      speechObjectUrlRef.current = null;
    }
  }, []);

  // Cleanup speech on unmount.
  useEffect(() => {
    return () => stopAnyPlayback();
  }, [stopAnyPlayback]);

  const playStepSpeech = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      stopAnyPlayback();

      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? `HTTP ${res.status}`);
        }
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("audio") && !ct.includes("octet-stream")) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Audio response was not playable.");
        }
        const blob = await res.blob();
        if (blob.size < 32) throw new Error("Empty audio response.");

        const url = URL.createObjectURL(blob);
        speechObjectUrlRef.current = url;
        const audio = new Audio(url);
        audio.setAttribute("playsinline", "");
        speechAudioRef.current = audio;

        audio.onended = () => {
          if (speechAudioRef.current === audio) speechAudioRef.current = null;
          if (speechObjectUrlRef.current === url) {
            URL.revokeObjectURL(url);
            speechObjectUrlRef.current = null;
          }
        };
        audio.onerror = () => {
          if (speechAudioRef.current === audio) speechAudioRef.current = null;
          if (speechObjectUrlRef.current === url) {
            URL.revokeObjectURL(url);
            speechObjectUrlRef.current = null;
          }
        };

        await audio.play();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Audio playback failed.";
        toast({
          title: t("chat.audioFailedTitle"),
          description: message,
          variant: "destructive",
        });
      }
    },
    [stopAnyPlayback, t],
  );

  // Whenever the lesson card content changes (a new interactive step lands,
  // OR a new chat-answer overlay arrives for a hand-authored tutorial),
  // speak the body when audio mode is on. We dedupe on a synthetic id that
  // combines step id + override id so a Q&A answer also gets spoken once.
  useEffect(() => {
    if (!tutorialId) {
      lastSpokenStepIdRef.current = null;
      stopAnyPlayback();
      return;
    }
    if (!currentStep) return;

    const overlayKey =
      tutorialChatOverride && tutorialChatOverride.stepId === currentStep.id
        ? `${currentStep.id}::override`
        : currentStep.id;
    if (lastSpokenStepIdRef.current === overlayKey) return;
    lastSpokenStepIdRef.current = overlayKey;

    if (!audioModeRef.current) return;

    const overlayActive =
      tutorialChatOverride && tutorialChatOverride.stepId === currentStep.id ? tutorialChatOverride : null;
    const body = overlayActive
      ? overlayActive.textRaw.trim()
      : currentStep.textRaw?.trim() || (currentStep.text ? t(currentStep.text) : "");
    if (!body) return;
    void playStepSpeech(body);
  }, [tutorialId, currentStep, tutorialChatOverride, playStepSpeech, stopAnyPlayback, t]);

  // Stop playback when leaving any active tutorial.
  useEffect(() => {
    if (!tutorialId) {
      stopAnyPlayback();
    }
  }, [tutorialId, stopAnyPlayback]);

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
        toast({
          title: t("chat.assistantUnavailable", { status: "interactive" }),
          description: reason,
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
        onSubmit={handleSubmit}
        className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-[hsl(var(--foreground)/0.92)] pl-1 pr-2 py-1 shadow-lg backdrop-blur-md"
      >
        <VoiceInput
          onTranscript={(value) => setText(value)}
          onInterimTranscript={(value) => setText(value)}
          disabled={effectiveLoading}
        />
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
