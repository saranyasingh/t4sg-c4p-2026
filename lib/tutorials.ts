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
    id: "gs-tabs",
    title: "tutorials.googleSearch.steps.gs-tabs.title",
    text: "tutorials.googleSearch.steps.gs-tabs.body",
    visual: "screen_text",
    highlightDescription:
      "The row of browser tabs at the top of Google Chrome and the plus (+) button to open a new tab next to the tabs.",
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
    id: "gs-address-bar",
    title: "tutorials.googleSearch.steps.gs-address-bar.title",
    text: "tutorials.googleSearch.steps.gs-address-bar.body",
    visual: "screen_text",
    highlightDescription:
      "The address bar at the top of Google Chrome showing the current web page URL or site address.",
  },
  {
    id: "gs-open-tabs-recent",
    title: "tutorials.googleSearch.steps.gs-open-tabs-recent.title",
    text: "tutorials.googleSearch.steps.gs-open-tabs-recent.body",
    visual: "screen_text",
    highlightDescription:
      "The tab search icon or small downward arrow in the Chrome tab strip used to search or list open tabs and recently closed tabs.",
  },
  {
    id: "gs-share-page",
    title: "tutorials.googleSearch.steps.gs-share-page.title",
    text: "tutorials.googleSearch.steps.gs-share-page.body",
    visual: "screen_text",
    highlightDescription:
      "The share icon in the Chrome toolbar to the right of the address bar.",
  },
  {
    id: "gs-bookmarks",
    title: "tutorials.googleSearch.steps.gs-bookmarks.title",
    text: "tutorials.googleSearch.steps.gs-bookmarks.body",
    visual: "screen_text",
    highlightDescription:
      "The star-shaped bookmark icon on the right side of the address bar in Google Chrome.",
  },
  {
    id: "gs-chrome-user",
    title: "tutorials.googleSearch.steps.gs-chrome-user.title",
    text: "tutorials.googleSearch.steps.gs-chrome-user.body",
    visual: "screen_text",
    highlightDescription:
      "The Google account profile picture or letter icon at the top right of the Chrome window.",
  },
  {
    id: "gs-chrome-menu",
    title: "tutorials.googleSearch.steps.gs-chrome-menu.title",
    text: "tutorials.googleSearch.steps.gs-chrome-menu.body",
    visual: "screen_text",
    highlightDescription:
      "The three vertical dots menu button at the top right corner of the Google Chrome window.",
  },
  {
    id: "gs-search-bar",
    title: "tutorials.googleSearch.steps.gs-search-bar.title",
    text: "tutorials.googleSearch.steps.gs-search-bar.body",
    visual: "screen_text",
    highlightDescription:
      "The large Google search box in the middle of the Google homepage, or the combined address and search bar at the top of Chrome.",
  },
  {
    id: "gs-try-layout",
    title: "tutorials.googleSearch.steps.gs-try-layout.title",
    text: "tutorials.googleSearch.steps.gs-try-layout.body",
    visual: "text",
  },
  {
    id: "gs-navigating",
    title: "tutorials.googleSearch.steps.gs-navigating.title",
    text: "tutorials.googleSearch.steps.gs-navigating.body",
    visual: "text",
  },
  {
    id: "gs-open-chrome",
    title: "tutorials.googleSearch.steps.gs-open-chrome.title",
    text: "tutorials.googleSearch.steps.gs-open-chrome.body",
    visual: "screen",
    highlightDescription:
      "The Google Chrome application icon on the desktop, taskbar, Windows Start menu, or macOS Dock.",
  },
  {
    id: "gs-navigate-url",
    title: "tutorials.googleSearch.steps.gs-navigate-url.title",
    text: "tutorials.googleSearch.steps.gs-navigate-url.body",
    visual: "screen_text",
    highlightDescription:
      "The address bar at the top of Chrome where you type a website address.",
  },
  {
    id: "gs-try-again",
    title: "tutorials.googleSearch.steps.gs-try-again.title",
    text: "tutorials.googleSearch.steps.gs-try-again.body",
    visual: "text",
  },
  {
    id: "gs-searching-intro",
    title: "tutorials.googleSearch.steps.gs-searching-intro.title",
    text: "tutorials.googleSearch.steps.gs-searching-intro.body",
    visual: "text",
  },
  {
    id: "gs-search-practice",
    title: "tutorials.googleSearch.steps.gs-search-practice.title",
    text: "tutorials.googleSearch.steps.gs-search-practice.body",
    visual: "screen_text",
    highlightDescription:
      "The address bar omnibox at the top of Chrome or the main search input on the Google search page.",
  },
  {
    id: "gs-more-options",
    title: "tutorials.googleSearch.steps.gs-more-options.title",
    text: "tutorials.googleSearch.steps.gs-more-options.body",
    visual: "text",
  },
  {
    id: "gs-review",
    title: "tutorials.googleSearch.steps.gs-review.title",
    text: "tutorials.googleSearch.steps.gs-review.body",
    visual: "text",
  },
  {
    id: "gs-next-time",
    title: "tutorials.googleSearch.steps.gs-next-time.title",
    text: "tutorials.googleSearch.steps.gs-next-time.body",
    visual: "text",
  },
];

export const TUTORIALS: readonly Tutorial[] = [
  {
    id: "google-search",
    title: "tutorials.googleSearch.title",
    steps: googleSearchSteps,
  },
] as const;

export function getTutorialById(id: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}
