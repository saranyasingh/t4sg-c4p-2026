/**
 * Screen region for step highlights (same shape as `Coordinates` from screenshot analysis).
 */
export type ScreenHighlight = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

/** Mirrors lesson tags: TEXT-only, SCREEN demo, or both. */
export type StepVisual = "text" | "screen" | "screen_text";

/**
 * One screen in a tutorial. Optional `highlight` draws a bounding box when you have coordinates.
 */
export type TutorialStep = {
  id: string;
  /** Section label, e.g. "4.2 Address bar" */
  title?: string;
  text: string;
  visual: StepVisual;
  highlight?: ScreenHighlight | null;
};

export type Tutorial = {
  id: string;
  title: string;
  steps: readonly TutorialStep[];
};

const googleSearchSteps: TutorialStep[] = [
  {
    id: "gs-01-intro",
    title: "1. Introduction",
    visual: "text",
    text: `This lesson covers how to use the internet: opening a web browser, understanding what you see on screen, and searching for websites.

You will learn step by step: what the internet and the Web are, how to open Chrome, how the browser works, what websites and URLs are, how search engines help you, how to run a search, and how to move around online — ending with a short practice and review.`,
  },
  {
    id: "gs-02-internet",
    title: "2. What is the Internet?",
    visual: "text",
    text: `The internet is a global network of connected computers and devices. It carries information and lets people communicate — email, video, websites, and more all travel over the internet.`,
  },
  {
    id: "gs-03-open-chrome",
    title: "3. Opening Google Chrome",
    visual: "screen",
    text: `Locate the Google Chrome icon on your desktop, taskbar, or Start menu.

Double-click the icon to open the browser.

Watch the screen: when Chrome opens, you should see a window with a top bar (tabs and address bar) and the main page area below. That is your workspace for browsing.`,
  },
  {
    id: "gs-04-1-tabs",
    title: "4.1 Tabs",
    visual: "screen_text",
    text: `Tabs are the clickable areas along the top of the browser. Each tab can show a different page.

Try opening a new tab: use the "+" next to your tabs, or the menu option for a new tab. A new empty tab usually appears so you can go to another site without closing the first one.`,
  },
  {
    id: "gs-04-2-address",
    title: "4.2 Address bar",
    visual: "screen_text",
    text: `The address bar shows the website address (URL) of the page you are on.

Click inside the address bar to select or edit the text. You can type a full address (for example, starting with https://) and press Enter to go there.`,
  },
  {
    id: "gs-04-3-nav",
    title: "4.3 Back, forward, and refresh",
    visual: "screen_text",
    text: `Back and Forward move between pages you have already visited in this tab.

Refresh reloads the current page from the server — useful if something did not load or you want the latest version.`,
  },
  {
    id: "gs-04-4-search-bar",
    title: "4.4 Search bar (Google page)",
    visual: "screen_text",
    text: `On Google’s homepage, the search bar is where you type when you do not know the exact website or you have a question.

Click in the search bar, type your words, then press Enter to see results.`,
  },
  {
    id: "gs-04-5-tools",
    title: "4.5 Other tools (quick overview)",
    visual: "screen_text",
    text: `Bookmarks: save a site so you can open it again quickly.

Share: send a link to a page.

Chrome menu: settings and browser options.

User icon: sign in and account-related settings.

Reopen closed tabs: bring back a tab you closed by mistake.`,
  },
  {
    id: "gs-05-website",
    title: "5. What is a website?",
    visual: "screen_text",
    text: `A website is a group of related pages published under one site name or organization — for example, a news site, a school site, or a shop.

On screen, look at the page in front of you: that is one page of a website. The address bar shows which site and page you are viewing.`,
  },
  {
    id: "gs-06-url",
    title: "6. What is a web address (URL)?",
    visual: "screen_text",
    text: `A URL (web address) tells the browser exactly where a webpage lives on the internet.

Look at the address bar in Chrome: the text there is the URL for the page you are on. It often starts with https:// and includes the site name and path.`,
  },
  {
    id: "gs-07-www",
    title: "7. What is the World Wide Web (WWW)?",
    visual: "text",
    text: `The World Wide Web is a system of linked documents and pages you open in a browser. The Web runs on top of the internet — the internet is the network; the Web is one way people access sites and pages through browsers like Chrome.`,
  },
  {
    id: "gs-08-search-engine",
    title: "8. What is a search engine?",
    visual: "screen_text",
    text: `A search engine helps you find information online by matching your words to pages across the Web.

Google is a widely used example. You type what you are looking for, and the search engine shows a list of results you can open.`,
  },
  {
    id: "gs-09-searching-core",
    title: "9. Searching for something (core task)",
    visual: "screen",
    text: `Follow these steps on screen:

1. Click the search bar (for example on Google’s homepage).
2. Type a word or a short question.
3. Press Enter.
4. Read the list of results.
5. Click a result to open a page.

Take your time and try each step in order.`,
  },
  {
    id: "gs-10-navigating",
    title: "10. Navigating the internet",
    visual: "screen_text",
    text: `Click links on a page to move to other pages or sites.

Scroll up and down to see more content on long pages.

Use the Back button to return to a page you visited before in this tab.`,
  },
  {
    id: "gs-11-practice",
    title: "11. Practice activity",
    visual: "screen",
    text: `Hands-on practice — try this now:

• Search for something you care about (for example weather, a hobby, or videos).
• Open a website from the results.
• Use Back to return to the results list.
• Bookmark a page you might want again.

Pause after each action and notice what changed on screen.`,
  },
  {
    id: "gs-12-review",
    title: "12. Review",
    visual: "text",
    text: `Check your understanding (answer in your own words or with a helper):

• Where do you find pages you saved for later?
• What does “WWW” refer to?
• What is a search engine?
• What are the basic steps to search for something?

When you are done, use Finish or Exit tutorial to return to the home screen.`,
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
