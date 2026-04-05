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
 * - `highlightDescription`: capture + vision API locates this target; bounding box is drawn for that step.
 * - `highlight`: optional fixed coordinates (same space as fullscreen overlay) when you are not using the API.
 */
export interface TutorialStep {
  id: string;
  /** Section label, e.g. "4.2 Address bar" */
  title?: string;
  text: string;
  visual: StepVisual;
  /** Natural-language target for Claude (e.g. "the Google Chrome icon in the Dock"). */
  highlightDescription?: string;
  highlight?: ScreenHighlight | null;
}

export interface Tutorial {
  id: string;
  title: string;
  steps: readonly TutorialStep[];
}

const googleSearchSteps: TutorialStep[] = [
  {
    id: "gs-01-intro",
    title: "Welcome to Lesson 1: Basic Google Search",
    visual: "text",
    text: `Welcome! This lesson is an introduction to using the internet.

Here is what you will learn today:
• Terms
• Browser Layout
• Navigating the Internet
• Using Google Chrome
• Searching for Websites`,
  },
  {
    id: "gs-02-internet",
    title: "Term: The Internet",
    visual: "text",
    text: `The Internet is a global computer network providing a variety of information and communication facilities, consisting of interconnected networks using standardized communication protocols.`,
  },
  {
    id: "gs-03-www",
    title: "Term: World Wide Web (WWW)",
    visual: "text",
    text: `The World Wide Web (WWW), commonly known as the Web, is an information system enabling documents and other web resources to be accessed over the Internet.`,
  },
  {
    id: "gs-04-search-engine",
    title: "Term: Search Engine",
    visual: "text",
    text: `A search engine is a service that allows Internet users to search for content via the World Wide Web (WWW).`,
  },
  {
    id: "gs-05-websites",
    title: "Term: Websites",
    visual: "text",
    text: `A website is a set of related web pages located under a single domain name, typically produced by a single person or organization.`,
  },
  {
    id: "gs-06-url",
    title: "Term: Web Address / URL",
    visual: "text",
    text: `The web address contains information about the location of the webpage.

There are 4 parts to a URL!`,
  },
  {
    id: "gs-07-open-chrome",
    title: "Using Google Chrome",
    visual: "screen",
    text: `Let's open Google Chrome!

Locate the Google Chrome icon on your desktop, taskbar, or Start menu.

Double-click the icon to open the browser.

When Chrome opens, you will see a window with a top bar (tabs and address bar) and the main page area below. That is your workspace for browsing.`,
    highlightDescription:
      "The Google Chrome application icon on the desktop, taskbar, Windows Start menu, or macOS Dock.",
  },
  {
    id: "gs-08-tabs",
    title: "Browser Layout: Tabs",
    visual: "screen",
    text: `A tab is a clickable area at the top of a window that shows another page or area.

Try opening a new tab: use the "+" next to your tabs, or the menu option for a new tab. A new empty tab will appear so you can go to another site without closing the first one.`,
    highlightDescription: "The new tab button near the top of the browser window. The plus sign next to the tabs.",
  },
  {
    id: "gs-09-address",
    title: "Browser Layout: Address Bar",
    visual: "screen_text",
    text: `The address bar is a text box in a web browser displaying the address of the web page that is currently being viewed.

Click inside the address bar to select or edit the text. You can type a full address and press Enter to go there.`,
  },
  {
    id: "gs-10-nav",
    title: "Browser Layout: Backward / Forward / Refresh",
    visual: "screen_text",
    text: `Backward and Forward allow web users to display the pages that have already been visited.

Refresh allows the web user to reload the page — useful if something did not load or you want the latest version.`,
  },
  {
    id: "gs-11-search-bar",
    title: "Browser Layout: Search Bar",
    visual: "screen_text",
    text: `The search bar is used when you don't know the exact address of a site you are looking for, or when you have a question on a topic.

The search bar can also be used to find Images and Videos.

Click in the search bar, type your words, then press Enter to see results.`,
  },
  {
    id: "gs-12-other-tools",
    title: "Browser Layout: Other Tools",
    visual: "screen_text",
    text: `Here are a few more helpful tools in Chrome:

Add / Remove Bookmarks: You can save a website to your bookmarks for easier access.

Share Page: You can share a website via a link.

Open Tabs / Recently Closed: You can easily reopen a tab that you either closed by accident or realized you still needed open.

Chrome User: You can click this for your Google Account settings.

Chrome Menu: You can click this for your Google Chrome menu.`,
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

export const TUTORIALS: readonly Tutorial[] = [
  {
    id: "google-search",
    title: "Google Search",
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
