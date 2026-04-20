import { INTERACTIVE_AI_TUTORIAL_ID, INTERACTIVE_AI_TUTORIAL_ROUTE } from "@/lib/interactive-tutorial";

export { INTERACTIVE_AI_TUTORIAL_ID, INTERACTIVE_AI_TUTORIAL_ROUTE };

/**
 * Screen region for step highlights (same shape as `Coordinates` from screenshot analysis).
 * x,y are the top-left corner of the rectangle in screenshot / overlay pixel space.
 */
export interface ScreenHighlight {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

/** Mirrors lesson tags: TEXT-only, SCREEN demo, or both. */
export type StepVisual = "text" | "screen" | "screen_text";

/**
 * One screen in a tutorial.
 * - `title` / `text`: i18n keys under `tutorials.googleSearch` (see lib/translations).
 * - `highlightDescription`: English phrase for vision API (not translated).
 * - `highlight`: optional fixed coordinates when not using the API.
 */
export interface TutorialStep {
  id: string;
  /** i18n key for step heading */
  title?: string;
  /** i18n key for step body */
  text: string;
  visual: StepVisual;
  /** Natural-language target for vision (English). */
  highlightDescription?: string;
  highlight?: ScreenHighlight | null;
}

/** Scripted lessons use i18n-backed steps; AI-guided lessons use empty steps and `/tutorials/interactive`. */
export type TutorialMode = "scripted" | "ai-guided";

export interface Tutorial {
  id: string;
  /** i18n key for tutorial name (e.g. home screen card). */
  title: string;
  steps: readonly TutorialStep[];
  mode?: TutorialMode;
}

/**
 * Metadata for the AI-led tutorial (not listed in `TUTORIALS` — no scripted `steps` to walk).
 * Use for titles and parity with {@link Tutorial} in interactive UI.
 */
export const AI_GUIDED_TUTORIAL: Tutorial = {
  id: INTERACTIVE_AI_TUTORIAL_ID,
  title: "tutorials.interactiveAi.courseTitle",
  steps: [],
  mode: "ai-guided",
};

const googleSearchSteps: TutorialStep[] = [
  {
    id: "gs-intro",
    title: "tutorials.googleSearch.steps.gs-intro.title",
    text: "tutorials.googleSearch.steps.gs-intro.body",
    visual: "text",
  },
  {
    id: "gs-internet",
    title: "tutorials.googleSearch.steps.gs-internet.title",
    text: "tutorials.googleSearch.steps.gs-internet.body",
    visual: "text",
  },
  {
    id: "gs-www",
    title: "tutorials.googleSearch.steps.gs-www.title",
    text: "tutorials.googleSearch.steps.gs-www.body",
    visual: "text",
  },
  {
    id: "gs-search-engine",
    title: "tutorials.googleSearch.steps.gs-search-engine.title",
    text: "tutorials.googleSearch.steps.gs-search-engine.body",
    visual: "text",
  },
  {
    id: "gs-websites",
    title: "tutorials.googleSearch.steps.gs-websites.title",
    text: "tutorials.googleSearch.steps.gs-websites.body",
    visual: "text",
  },
  {
    id: "gs-url",
    title: "tutorials.googleSearch.steps.gs-url.title",
    text: "tutorials.googleSearch.steps.gs-url.body",
    visual: "text",
  },
  {
    id: "gs-browser-layout",
    title: "tutorials.googleSearch.steps.gs-browser-layout.title",
    text: "tutorials.googleSearch.steps.gs-browser-layout.body",
    visual: "text",
  },
  {
    id: "gs-open-chrome",
    title: "tutorials.googleSearch.steps.gs-open-chrome.title",
    text: "tutorials.googleSearch.steps.gs-open-chrome.body",
    visual: "screen",
    highlightDescription:
      "The Google Chrome application icon on the desktop, taskbar, Windows Start menu. Return a larger bounding box than necessary. ",
  },
  {
    id: "gs-tabs",
    title: "tutorials.googleSearch.steps.gs-tabs.title",
    text: "tutorials.googleSearch.steps.gs-tabs.body",
    visual: "screen_text",
    highlightDescription:
      "The row of browser tabs at the top of Google Chrome and the plus (+) button to open a new tab next to the tabs.",
  },
  {
    id: "gs-address-bar",
    title: "tutorials.googleSearch.steps.gs-address-bar.title",
    text: "tutorials.googleSearch.steps.gs-address-bar.body",
    visual: "screen_text",
    highlightDescription:
      "The address bar at the top of Google Chrome showing the current web page URL or site address.",
  },
  {
    id: "gs-back-forward-refresh",
    title: "tutorials.googleSearch.steps.gs-back-forward-refresh.title",
    text: "tutorials.googleSearch.steps.gs-back-forward-refresh.body",
    visual: "screen_text",
    highlightDescription:
      "The back arrow, forward arrow, and circular refresh button immediately to the left of the address bar in Google Chrome.",
  },
  {
    id: "gs-bookmarks",
    title: "tutorials.googleSearch.steps.gs-bookmarks.title",
    text: "tutorials.googleSearch.steps.gs-bookmarks.body",
    visual: "screen_text",
    highlightDescription: "The star-shaped bookmark icon on the right side of the address bar in Google Chrome.",
  },
  {
    id: "gs-chrome-user",
    title: "tutorials.googleSearch.steps.gs-chrome-user.title",
    text: "tutorials.googleSearch.steps.gs-chrome-user.body",
    visual: "screen_text",
    highlightDescription: "The Google account profile picture or letter icon at the top right of the Chrome window.",
  },
  {
    id: "gs-chrome-menu",
    title: "tutorials.googleSearch.steps.gs-chrome-menu.title",
    text: "tutorials.googleSearch.steps.gs-chrome-menu.body",
    visual: "screen_text",
    highlightDescription: "The three vertical dots menu button at the top right corner of the Google Chrome window.",
  },
  {
    id: "gs-review",
    title: "tutorials.googleSearch.steps.gs-review.title",
    text: "tutorials.googleSearch.steps.gs-review.body",
    visual: "text",
  }
];

const gmailSteps: TutorialStep[] = [
  {
    id: "gm-01-intro",
    title: "tutorials.gmail.gm-01-intro.title",
    text: "tutorials.gmail.gm-01-intro.text",
    visual: "text",
  },
  {
    id: "gm-02-what-is-email",
    title: "tutorials.gmail.gm-02-what-is-email.title",
    text: "tutorials.gmail.gm-02-what-is-email.text",
    visual: "text",
  },
  {
    id: "gm-03-email-parts-labels",
    title: "tutorials.gmail.gm-03-email-parts-labels.title",
    text: "tutorials.gmail.gm-03-email-parts-labels.text",
    visual: "text",
  },
  {
    id: "gm-04-email-parts-rules",
    title: "tutorials.gmail.gm-04-email-parts-rules.title",
    text: "tutorials.gmail.gm-04-email-parts-rules.text",
    visual: "text",
  },
  {
    id: "gm-05-email-username",
    title: "tutorials.gmail.gm-05-email-username.title",
    text: "tutorials.gmail.gm-05-email-username.text",
    visual: "text",
  },
  {
    id: "gm-08-open-chrome",
    title: "tutorials.gmail.gm-08-open-chrome.title",
    text: "tutorials.gmail.gm-08-open-chrome.text",
    visual: "screen",
    highlightDescription:
      "The Google Chrome application icon on the desktop, taskbar, Windows Start menu, or macOS Dock.",
  },
  {
    id: "gm-09-create-account",
    title: "tutorials.gmail.gm-09-create-account.title",
    text: "tutorials.gmail.gm-09-create-account.text",
    visual: "screen",
    highlightDescription: "The 'Create account' link below the sign-in box on the Gmail page.",
  },
  {
    id: "gm-10-enter-name",
    title: "tutorials.gmail.gm-10-enter-name.title",
    text: "tutorials.gmail.gm-10-enter-name.text",
    visual: "screen",
    highlightDescription: "The first name and last name input fields on the Google account creation form.",
  },
  {
    id: "gm-11-choose-email",
    title: "tutorials.gmail.gm-11-choose-email.title",
    text: "tutorials.gmail.gm-11-choose-email.text",
    visual: "screen",
    highlightDescription: "The username / Gmail address input field on the Google account creation form.",
  },
  {
    id: "gm-12-choose-password",
    title: "tutorials.gmail.gm-12-choose-password.title",
    text: "tutorials.gmail.gm-12-choose-password.text",
    visual: "screen",
    highlightDescription: "The password and confirm password input fields on the Google account creation form.",
  },
  {
    id: "gm-12a-personal-info",
    title: "tutorials.gmail.gm-12a-personal-info.title",
    text: "tutorials.gmail.gm-12a-personal-info.text",
    visual: "screen",
    highlightDescription:
      "The personal info form on the Google account setup page with phone number, recovery email, birthday, and gender fields.",
  },
  {
    id: "gm-12b-verify-phone",
    title: "tutorials.gmail.gm-12b-verify-phone.title",
    text: "tutorials.gmail.gm-12b-verify-phone.text",
    visual: "screen",
    highlightDescription:
      "The Enter verification code input field and Verify button on the Google phone verification page.",
  },
  {
    id: "gm-13-logging-in",
    title: "tutorials.gmail.gm-13-logging-in.title",
    text: "tutorials.gmail.gm-13-logging-in.text",
    visual: "text",
  },
  {
    id: "gm-14-go-to-google",
    title: "tutorials.gmail.gm-14-go-to-google.title",
    text: "tutorials.gmail.gm-14-go-to-google.text",
    visual: "screen",
    highlightDescription: "The Gmail link in the top right corner of the Google homepage.",
  },
  {
    id: "gm-15-enter-email",
    title: "tutorials.gmail.gm-15-enter-email.title",
    text: "tutorials.gmail.gm-15-enter-email.text",
    visual: "screen",
    highlightDescription: "The Email or phone input field on the Gmail sign in page.",
  },
  {
    id: "gm-16-enter-password",
    title: "tutorials.gmail.gm-16-enter-password.title",
    text: "tutorials.gmail.gm-16-enter-password.text",
    visual: "screen",
    highlightDescription: "The Enter your password input field on the Gmail sign in page.",
  },
  {
    id: "gm-17-inbox",
    title: "tutorials.gmail.gm-17-inbox.title",
    text: "tutorials.gmail.gm-17-inbox.text",
    visual: "screen",
    highlightDescription: "The Gmail inbox with the Compose button and folder list on the left side.",
  },
  {
    id: "gm-18-opening-replying",
    title: "tutorials.gmail.gm-18-opening-replying.title",
    text: "tutorials.gmail.gm-18-opening-replying.text",
    visual: "text",
  },
  {
    id: "gm-19-open-inbox",
    title: "tutorials.gmail.gm-19-open-inbox.title",
    text: "tutorials.gmail.gm-19-open-inbox.text",
    visual: "screen",
    highlightDescription: "The Inbox folder in the left sidebar of Gmail.",
  },
  {
    id: "gm-20-read-email",
    title: "tutorials.gmail.gm-20-read-email.title",
    text: "tutorials.gmail.gm-20-read-email.text",
    visual: "screen",
    highlightDescription: "The Reply and Forward buttons at the bottom of an open email in Gmail.",
  },
  {
    id: "gm-21-click-reply",
    title: "tutorials.gmail.gm-21-click-reply.title",
    text: "tutorials.gmail.gm-21-click-reply.text",
    visual: "screen",
    highlightDescription:
      "The Reply button at the bottom of the open email and the reply arrow icon in the top right corner of the message.",
  },
  {
    id: "gm-22-type-reply",
    title: "tutorials.gmail.gm-22-type-reply.title",
    text: "tutorials.gmail.gm-22-type-reply.text",
    visual: "screen",
    highlightDescription: "The reply text box and Send button at the bottom of the open email in Gmail.",
  },
  {
    id: "gm-23-reply-sent",
    title: "tutorials.gmail.gm-23-reply-sent.title",
    text: "tutorials.gmail.gm-23-reply-sent.text",
    visual: "screen",
    highlightDescription:
      "The sent reply message in the email thread and the Message sent notification at the bottom of the Gmail screen.",
  },
  {
    id: "gm-24-sending-email",
    title: "tutorials.gmail.gm-24-sending-email.title",
    text: "tutorials.gmail.gm-24-sending-email.text",
    visual: "text",
  },
  {
    id: "gm-25-click-compose",
    title: "tutorials.gmail.gm-25-click-compose.title",
    text: "tutorials.gmail.gm-25-click-compose.text",
    visual: "screen",
    highlightDescription: "The Compose button in the top left corner of the Gmail inbox.",
  },
  {
    id: "gm-26-new-message",
    title: "tutorials.gmail.gm-26-new-message.title",
    text: "tutorials.gmail.gm-26-new-message.text",
    visual: "screen",
    highlightDescription: "The To field in the New Message compose window in Gmail.",
  },
  {
    id: "gm-27-enter-recipient",
    title: "tutorials.gmail.gm-27-enter-recipient.title",
    text: "tutorials.gmail.gm-27-enter-recipient.text",
    visual: "screen",
    highlightDescription: "The To field in the New Message compose window showing the recipient's name.",
  },
  {
    id: "gm-28-type-message",
    title: "tutorials.gmail.gm-28-type-message.title",
    text: "tutorials.gmail.gm-28-type-message.text",
    visual: "screen",
    highlightDescription: "The Subject field and message body area in the Gmail compose window.",
  },
  {
    id: "gm-29-message-sent",
    title: "tutorials.gmail.gm-29-message-sent.title",
    text: "tutorials.gmail.gm-29-message-sent.text",
    visual: "screen",
    highlightDescription: "The Message sent notification in the bottom left corner of the Gmail screen.",
  },
];

export const TUTORIALS: readonly Tutorial[] = [
  {
    id: "google-search",
    title: "tutorials.googleSearch.title",
    steps: googleSearchSteps,
  },
  {
    id: "gmail",
    title: "Gmail",
    steps: gmailSteps,
  },
] as const;

export function getTutorialById(id: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}
