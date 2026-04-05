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
    title: "Welcome to Lesson 6: Intro to Gmail",
    visual: "text",
    text: `Welcome! This lesson is an Introduction on how to use Email (Gmail).

What You Will Learn Today:
• What's an Email?
• Signing up for a Gmail account
• Logging into Gmail
• Opening and Replying to Emails
• Sending Emails
• Practicing Sending Emails`,
  },
  {
    id: "gm-02-what-is-email",
    title: "What's an Email?",
    visual: "text",
    text: `Sending an email is just like mailing someone a letter at the post office.

• The letter is mailed digitally through the Internet, and the person receives the letter instantly.
• You can include pictures, documents, videos & other computer files.
• You can send an email to one person, or to multiple people at the same time.
• You can access your email on any device that has the internet.
• It's FREE!`,
  },
  {
    id: "gm-03-email-parts-labels",
    title: "Parts of an Email Address",
    visual: "text",
    text: `Example: jeanpierreellameh@computers4people.org

• Like a real address, the email address has to be typed correctly, or the other person will not receive their mail.

• It will always have two main parts, which are connected by the "@" symbol.`,
  },
  {
    id: "gm-04-email-parts-rules",
    title: "Parts of an Email Address",
    visual: "text",
    text: `Example: jeanpierreellameh@computers4people.org

• The first part of the email address is the person's username (here, jeanpierreellameh).

• This is similar to the name you write on a regular mailing address.`,
  },
  {
    id: "gm-05-email-username",
    title: "Parts of an Email Address",
    visual: "text",
    text: `Example: jeanpierreellameh@computers4people.org

• The second part of the email address is the location (here, computers4people).

• It could be the name of an email provider, the organization the person works for, or a website that the person is associated with.`,
  },
  {
    id: "gm-08-open-chrome",
    title: "Signing up for a Gmail Account",
    visual: "screen",
    text: `Let's sign up for a Gmail account!

First, open Google Chrome on your computer.

In the address bar at the top, type: www.gmail.com and press Enter.

You will see the Gmail sign-in page.`,
    highlightDescription:
      "The Google Chrome application icon on the desktop, taskbar, Windows Start menu, or macOS Dock.",
  },
  {
    id: "gm-09-create-account",
    title: "Signing up for a Gmail Account",
    visual: "screen",
    text: `Click "Create account" next to the sign-in box.

A form will appear asking for your information.`,
    highlightDescription: "The 'Create account' link below the sign-in box on the Gmail page.",
  },
  {
    id: "gm-10-enter-name",
    title: "Signing up for a Gmail Account",
    visual: "screen",
    text: `Enter your first and last name in the fields provided.

Then click "Next" to continue.`,
    highlightDescription: "The first name and last name input fields on the Google account creation form.",
  },
  {
    id: "gm-11-choose-email",
    title: "Signing up for a Gmail Account",
    visual: "screen",
    text: `Choose your Gmail address. This will be your username.

• Usernames are unique to each account, and it may be hard to find something that is not already taken.

• Use something appropriate to share with anyone you may give your email to.

Then click "Next" to continue.`,
    highlightDescription: "The username / Gmail address input field on the Google account creation form.",
  },
  {
    id: "gm-12-choose-password",
    title: "Signing up for a Gmail Account",
    visual: "screen",
    text: `Create a password for your account.

• Your password must be at least 8 characters. Use a mix of letters, numbers, and symbols to make it strong.

• Do not use your name or other
common words.

Type your password again to confirm it, then click "Next".`,
    highlightDescription: "The password and confirm password input fields on the Google account creation form.",
  },
  {
    id: "gm-12a-personal-info",
    title: "Signing up for a Gmail Account",
    visual: "screen",
    text: `Google will now ask for some personal information.

You may enter a phone number and recovery email address. These are optional, but help keep your account secure.

Enter your birthday using the Month, Day, and Year fields.

Select your gender from the dropdown menu.

When you are done, click "Next" to continue.`,
    highlightDescription:
      "The personal info form on the Google account setup page with phone number, recovery email, birthday, and gender fields.",
  },
  {
    id: "gm-12b-verify-phone",
    title: "Signing up for a Gmail Account",
    visual: "screen",
    text: `Google will send a 6-digit verification code to your phone number as a text message.

Check your phone for the text message from Google.

Type the 6-digit code into the "Enter verification code" field.

Then click "Verify" to continue.`,
    highlightDescription:
      "The Enter verification code input field and Verify button on the Google phone verification page.",
  },
  {
    id: "gm-13-logging-in",
    title: "Logging into Gmail",
    visual: "text",
    text: `Let's log into your Gmail account!`,
  },
  {
    id: "gm-14-go-to-google",
    title: "Logging into Gmail",
    visual: "screen",
    text: `Open Google Chrome and go to www.google.com.

In the top right corner, click "Gmail".`,
    highlightDescription: "The Gmail link in the top right corner of the Google homepage.",
  },
  {
    id: "gm-15-enter-email",
    title: "Logging into Gmail",
    visual: "screen",
    text: `You will see a Sign In page.

Type your Gmail address into the "Email or phone" field.

Then click "Next".`,
    highlightDescription: "The Email or phone input field on the Gmail sign in page.",
  },
  {
    id: "gm-16-enter-password",
    title: "Logging into Gmail",
    visual: "screen",
    text: `Type your password into the "Enter your password" field.

Then click "Next".`,
    highlightDescription: "The Enter your password input field on the Gmail sign in page.",
  },
  {
    id: "gm-17-inbox",
    title: "Logging into Gmail",
    visual: "screen",
    text: `You are now logged in!

This is your Gmail inbox. Here you can see your emails, compose new ones, and navigate your mail folders on the left side.`,
    highlightDescription: "The Gmail inbox with the Compose button and folder list on the left side.",
  },
  {
    id: "gm-18-opening-replying",
    title: "Opening and Replying to Email",
    visual: "text",
    text: `Now let's open and reply to an email!`,
  },
  {
    id: "gm-19-open-inbox",
    title: "Opening and Replying to Email",
    visual: "screen",
    text: `Click on "Inbox" on the left side of the screen.

You will see a list of emails you have received. Click on an email to open it.`,
    highlightDescription: "The Inbox folder in the left sidebar of Gmail.",
  },
  {
    id: "gm-20-read-email",
    title: "Opening and Replying to Email",
    visual: "screen",
    text: `The email is now open and you can read the full message.

At the bottom of the email you will see a "Reply" button and a "Forward" button.`,
    highlightDescription: "The Reply and Forward buttons at the bottom of an open email in Gmail.",
  },
  {
    id: "gm-21-click-reply",
    title: "Opening and Replying to Email",
    visual: "screen",
    text: `To reply, click the "Reply" button at the bottom of the email, or the reply arrow icon in the top right corner of the message.`,
    highlightDescription:
      "The Reply button at the bottom of the open email and the reply arrow icon in the top right corner of the message.",
  },
  {
    id: "gm-22-type-reply",
    title: "Opening and Replying to Email",
    visual: "screen",
    text: `A text box will appear at the bottom of the screen.

Type your reply message in the text box.

When you are done, click the "Send" button to send your reply.`,
    highlightDescription: "The reply text box and Send button at the bottom of the open email in Gmail.",
  },
  {
    id: "gm-23-reply-sent",
    title: "Opening and Replying to Email",
    visual: "screen",
    text: `Your reply has been sent!

You will see your sent message appear in the email thread, and a "Message sent" notification at the bottom of the screen.`,
    highlightDescription:
      "The sent reply message in the email thread and the Message sent notification at the bottom of the Gmail screen.",
  },
  {
    id: "gm-24-sending-email",
    title: "Sending Email",
    visual: "text",
    text: `Now let's send an email!`,
  },
  {
    id: "gm-25-click-compose",
    title: "Sending Email",
    visual: "screen",
    text: `Click the "Compose" button in the top left corner of your inbox.`,
    highlightDescription: "The Compose button in the top left corner of the Gmail inbox.",
  },
  {
    id: "gm-26-new-message",
    title: "Sending Email",
    visual: "screen",
    text: `A "New Message" window will appear in the bottom right corner of your screen.

Click on the "To" field and type the email address of the person you want to send the email to.`,
    highlightDescription: "The To field in the New Message compose window in Gmail.",
  },
  {
    id: "gm-27-enter-recipient",
    title: "Sending Email",
    visual: "screen",
    text: `Type the email address of the person you are sending the email to and press Enter.

Their name will appear in the "To" field.`,
    highlightDescription: "The To field in the New Message compose window showing the recipient's name.",
  },
  {
    id: "gm-28-type-message",
    title: "Sending Email",
    visual: "screen",
    text: `Click on the "Subject" field and type a short description of your email.

Then click in the large area below and type your message.`,
    highlightDescription: "The Subject field and message body area in the Gmail compose window.",
  },
  {
    id: "gm-29-message-sent",
    title: "Sending Email",
    visual: "screen",
    text: `When you are done, click the "Send" button.

Your email has been sent! You will see a "Message sent" notification appear in the bottom left corner of the screen.`,
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
