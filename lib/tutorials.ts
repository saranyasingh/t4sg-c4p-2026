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
    highlightDescription:
          "The new tab button near the top of the browser window. The plus sign next to the tabs.",
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

export const TUTORIALS: readonly Tutorial[] = [
  {
    id: "google-search",
    title: "Google Search",
    steps: googleSearchSteps,
  },
] as const;

export function getTutorialById(id: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}
