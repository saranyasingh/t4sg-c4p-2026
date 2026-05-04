/** Mirrors lesson tags: TEXT-only, SCREEN demo, or both. */
export type StepVisual = "text" | "screen" | "screen_text";

/**
 * One screen in a tutorial.
 *
 * - `title` / `text`: i18n keys under `tutorials.googleSearch` (see lib/translations).
 * - `titleRaw` / `textRaw`: non-i18n strings used for AI-generated steps.
 * - `highlightDescription`: a natural-language description of the on-screen
 *   target. The Claude Computer Use API uses this to locate the element on
 *   the user's full screen and an animated arrow points at it. This is the
 *   only supported targeting field.
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
  /** Natural-language target for the Claude Computer Use API (English). */
  highlightDescription?: string;
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
      "The Google Chrome application icon on the desktop, taskbar, or Windows Start menu.",
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
  },
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

/* const wifiSteps: TutorialStep[] = [
  {
    id: "wifi-intro",
    title: "tutorials.wifi.steps.wifi-intro.title",
    text: "tutorials.wifi.steps.wifi-intro.body",
    visual: "text",
  },
  {
    id: "wifi-what",
    title: "tutorials.wifi.steps.wifi-what.title",
    text: "tutorials.wifi.steps.wifi-what.body",
    visual: "text",
  },
  {
    id: "wifi-router",
    title: "tutorials.wifi.steps.wifi-router.title",
    text: "tutorials.wifi.steps.wifi-router.body",
    visual: "text",
  },
  {
    id: "wifi-network-name",
    title: "tutorials.wifi.steps.wifi-network-name.title",
    text: "tutorials.wifi.steps.wifi-network-name.body",
    visual: "text",
  },
  {
    id: "wifi-find-icon",
    title: "tutorials.wifi.steps.wifi-find-icon.title",
    text: "tutorials.wifi.steps.wifi-find-icon.body",
    visual: "screen_text",
    highlightDescription:
      "The WiFi or network status icon in the system tray at the bottom-right of the Windows taskbar (looks like radio waves, a globe, or a small monitor with a cable).",
  },
  {
    id: "wifi-open-quick-settings",
    title: "tutorials.wifi.steps.wifi-open-quick-settings.title",
    text: "tutorials.wifi.steps.wifi-open-quick-settings.body",
    visual: "screen_text",
    highlightDescription:
      "The Windows quick settings flyout that opens from the system tray, showing the WiFi, Bluetooth, and Airplane mode toggle tiles.",
  },
  {
    id: "wifi-open-network-list",
    title: "tutorials.wifi.steps.wifi-open-network-list.title",
    text: "tutorials.wifi.steps.wifi-open-network-list.body",
    visual: "screen_text",
    highlightDescription:
      "The small arrow (chevron) button next to the WiFi tile inside the Windows quick settings flyout that opens the list of available WiFi networks.",
  },
  {
    id: "wifi-pick-network",
    title: "tutorials.wifi.steps.wifi-pick-network.title",
    text: "tutorials.wifi.steps.wifi-pick-network.body",
    visual: "screen_text",
    highlightDescription:
      "The list of available WiFi network names shown in the Windows network flyout, each row showing a network name and a signal strength icon.",
  },
  {
    id: "wifi-connect",
    title: "tutorials.wifi.steps.wifi-connect.title",
    text: "tutorials.wifi.steps.wifi-connect.body",
    visual: "screen_text",
    highlightDescription:
      "The blue Connect button shown under the selected WiFi network row in the Windows network flyout.",
  },
  {
    id: "wifi-password",
    title: "tutorials.wifi.steps.wifi-password.title",
    text: "tutorials.wifi.steps.wifi-password.body",
    visual: "screen_text",
    highlightDescription:
      "The password input field for joining a WiFi network in Windows, with the Next button below it.",
  },
  {
    id: "wifi-connected",
    title: "tutorials.wifi.steps.wifi-connected.title",
    text: "tutorials.wifi.steps.wifi-connected.body",
    visual: "screen_text",
    highlightDescription:
      "The connected WiFi network at the top of the Windows network flyout, showing 'Connected, secured' beneath the network name.",
  },
  {
    id: "wifi-troubleshoot",
    title: "tutorials.wifi.steps.wifi-troubleshoot.title",
    text: "tutorials.wifi.steps.wifi-troubleshoot.body",
    visual: "text",
  },
  {
    id: "wifi-review",
    title: "tutorials.wifi.steps.wifi-review.title",
    text: "tutorials.wifi.steps.wifi-review.body",
    visual: "text",
  },
]; */

/**
 * App Tour (Help). The right-hand GransonAI panel stays visible; each step
 * uses `highlightDescription` so the Claude Computer Use API can point at the
 * relevant in-panel control (same path as Gmail / Google Search screen steps).
 */
const introSteps: TutorialStep[] = [
  {
    id: "intro-welcome",
    title: "tutorials.intro.intro-welcome.title",
    text: "tutorials.intro.intro-welcome.text",
    visual: "screen_text",
    highlightDescription:
      "The white Next button in the bottom-left tutorial navigation bar on the screen, next to darker Back and Exit tutorial buttons.",
  },
  {
    id: "intro-chat",
    title: "tutorials.intro.intro-chat.title",
    text: "tutorials.intro.intro-chat.text",
    visual: "screen_text",
    highlightDescription:
      "The scrollable chat message area in the right-hand Granson AI side panel, above the text field and microphone.",
  },
  {
    id: "intro-screen",
    title: "tutorials.intro.intro-screen.title",
    text: "tutorials.intro.intro-screen.text",
    visual: "screen_text",
    highlightDescription:
      "The chat text input or textarea at the bottom of the right-hand side panel where the user types messages to the assistant, next to the send button.",
  },
  {
    id: "intro-voice",
    title: "tutorials.intro.intro-voice.title",
    text: "tutorials.intro.intro-voice.text",
    visual: "screen_text",
    highlightDescription:
      "The circular microphone button to the left of the chat text field in the right-hand Granson AI panel.",
  },
  {
    id: "intro-tutorials",
    title: "tutorials.intro.intro-tutorials.title",
    text: "tutorials.intro.intro-tutorials.text",
    visual: "screen_text",
    highlightDescription:
      "The Tutorials tab in the row of three tabs (Home, Tutorials, Options) below the logo in the right-hand side panel.",
  },
  {
    id: "intro-exit",
    title: "tutorials.intro.intro-exit.title",
    text: "tutorials.intro.intro-exit.text",
    visual: "screen_text",
    highlightDescription:
      "The Exit tutorial button with ghost outline styling in the bottom-left tutorial control bar.",
  },
  {
    id: "intro-help",
    title: "tutorials.intro.intro-help.title",
    text: "tutorials.intro.intro-help.text",
    visual: "screen_text",
    highlightDescription:
      "The Help button with a help-circle icon in the top-right corner of the right-hand side panel.",
  },
  {
    id: "intro-finish",
    title: "tutorials.intro.intro-finish.title",
    text: "tutorials.intro.intro-finish.text",
    visual: "screen_text",
    highlightDescription:
      "The rightmost light-on-dark primary button in the bottom-left tutorial controls (Next or Finish), beside Exit tutorial.",
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
  // {
  //   id: "wifi",
  //   title: "tutorials.wifi.title",
  //   steps: wifiSteps,
  // },
] as const;

export function getTutorialById(id: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}
