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
  /** Raw (non-i18n) step heading, used for AI-generated steps. */
  titleRaw?: string;
  /** i18n key for step body */
  text: string;
  /** Raw (non-i18n) step body, used for AI-generated steps. */
  textRaw?: string;
  visual: StepVisual;
  /** Natural-language target for vision (English). */
  highlightDescription?: string;
  highlight?: ScreenHighlight | null;
  /**
   * CSS selector for in-app elements to spotlight (resolved at runtime via
   * getBoundingClientRect). Preferred over `highlight` for tutorials that
   * target elements inside the Granson panel, since it follows resizes.
   */
  highlightSelector?: string;
  /** Optional per-step spotlight growth factor; lower values create tighter highlights. */
  highlightExpandFactor?: number;
  /** Optional per-step minimum spotlight padding in CSS pixels. */
  highlightMinPadding?: number;
  /** Optional per-step selector highlight offset in CSS pixels. */
  highlightOffsetX?: number;
  highlightOffsetY?: number;
  /**
   * When true, render the spotlight with a bright, glowing treatment instead of
   * dimming the rest of the screen. Useful when the surrounding UI should stay
   * visible (e.g. exit/finish steps where we want the chat to remain readable).
   */
  highlightBright?: boolean;
}

export interface Tutorial {
  id: string;
  /** i18n key for tutorial name (e.g. home screen card). */
  title: string;
  steps: readonly TutorialStep[];
}

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

/**
 * Introductory tour of the Granson AI app itself. Targets elements inside the
 * panel using CSS selectors (`data-intro="…"`) so the spotlight tracks layout
 * changes. Each step should be short and welcoming — this is the first thing a
 * new user sees via the HELP button.
 */
const introSteps: TutorialStep[] = [
  {
    id: "intro-welcome",
    title: "tutorials.intro.intro-welcome.title",
    text: "tutorials.intro.intro-welcome.text",
    visual: "text",
  },
  {
    id: "intro-chat",
    title: "tutorials.intro.intro-chat.title",
    text: "tutorials.intro.intro-chat.text",
    visual: "screen_text",
    highlightSelector: "[data-intro='chat-input']",
  },
  {
    id: "intro-screen",
    title: "tutorials.intro.intro-screen.title",
    text: "tutorials.intro.intro-screen.text",
    visual: "screen_text",
    highlightSelector: "[data-intro='chat-box']",
  },
  {
    id: "intro-voice",
    title: "tutorials.intro.intro-voice.title",
    text: "tutorials.intro.intro-voice.text",
    visual: "screen_text",
    highlightSelector: "[data-intro='voice']",
    highlightExpandFactor: 1.25,
    highlightMinPadding: 10,
  },
  {
    id: "intro-audio-mode",
    title: "tutorials.intro.intro-audio-mode.title",
    text: "tutorials.intro.intro-audio-mode.text",
    visual: "screen_text",
    highlightSelector: "[data-intro='audio-mode']",
    highlightExpandFactor: 1.0,
    highlightMinPadding: 2,
  },
  {
    id: "intro-language",
    title: "tutorials.intro.intro-language.title",
    text: "tutorials.intro.intro-language.text",
    visual: "screen_text",
    highlightSelector: "[data-intro='language']",
    highlightExpandFactor: 1.0,
    highlightMinPadding: 2,
  },
  {
    id: "intro-tutorials",
    title: "tutorials.intro.intro-tutorials.title",
    text: "tutorials.intro.intro-tutorials.text",
    visual: "screen_text",
    highlightSelector: "[data-intro='tutorials']",
    highlightExpandFactor: 1.0,
    highlightMinPadding: 4,
  },
  {
    id: "intro-exit",
    title: "tutorials.intro.intro-exit.title",
    text: "tutorials.intro.intro-exit.text",
    visual: "screen_text",
    highlightSelector: "#tutorial-exit-button",
    highlightExpandFactor: 1.08,
    highlightMinPadding: 10,
    highlightBright: true,
  },
  {
    id: "intro-help",
    title: "tutorials.intro.intro-help.title",
    text: "tutorials.intro.intro-help.text",
    visual: "screen_text",
    highlightSelector: "[data-intro='help']",
    highlightExpandFactor: 1.0,
    highlightMinPadding: 4,
  },
  {
    id: "intro-finish",
    title: "tutorials.intro.intro-finish.title",
    text: "tutorials.intro.intro-finish.text",
    visual: "screen_text",
    highlightSelector: "#tutorial-finish-button",
    highlightExpandFactor: 1.0,
    highlightMinPadding: 6,
    highlightBright: true,
  },
];

export const INTRO_TUTORIAL_ID = "intro";

/** AI-driven interactive tutorial (not listed in TUTORIALS; driven by TutorialProvider state). */
export const INTERACTIVE_TUTORIAL_ID = "interactive";

export const TUTORIALS: readonly Tutorial[] = [
  {
    id: INTRO_TUTORIAL_ID,
    title: "tutorials.intro.title",
    steps: introSteps,
  },
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
