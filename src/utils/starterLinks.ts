// Starter links for an empty library — Bookmarks' counterpart of Habits'
// templates. Picked links are filed into a folder per group, so the first thing
// a new library shows is the folder view it's built around. Pure — see
// starterLinks.test.ts.

export type StarterLink = { title: string; url: string };
export type StarterGroup = { name: string; emoji: string; links: StarterLink[] };

export const STARTER_GROUPS: StarterGroup[] = [
  {
    name: "Mail & calendar",
    emoji: "✉️",
    links: [
      { title: "Gmail", url: "https://mail.google.com/" },
      { title: "Google Calendar", url: "https://calendar.google.com/" },
      { title: "Outlook", url: "https://outlook.live.com/" },
    ],
  },
  {
    name: "Work",
    emoji: "💼",
    links: [
      { title: "Google Drive", url: "https://drive.google.com/" },
      { title: "Google Docs", url: "https://docs.google.com/" },
      { title: "Notion", url: "https://www.notion.so/" },
      { title: "Slack", url: "https://app.slack.com/" },
    ],
  },
  {
    name: "Dev",
    emoji: "🛠️",
    links: [
      { title: "GitHub", url: "https://github.com/" },
      { title: "Stack Overflow", url: "https://stackoverflow.com/" },
      { title: "MDN Web Docs", url: "https://developer.mozilla.org/" },
    ],
  },
  {
    name: "Reading",
    emoji: "📰",
    links: [
      { title: "Wikipedia", url: "https://www.wikipedia.org/" },
      { title: "Hacker News", url: "https://news.ycombinator.com/" },
      { title: "BBC News", url: "https://www.bbc.com/news" },
    ],
  },
  {
    name: "Learning",
    emoji: "🎓",
    links: [
      { title: "YouTube", url: "https://www.youtube.com/" },
      { title: "Khan Academy", url: "https://www.khanacademy.org/" },
      { title: "Coursera", url: "https://www.coursera.org/" },
    ],
  },
];

export type StarterPlan = { folder: string; links: StarterLink[] }[];

/**
 * The picked links grouped by the folder each goes in, in the groups' own order,
 * skipping any link the library already holds (by URL, ignoring a trailing slash
 * and case) and any group left empty.
 */
export function planStarterLinks(picked: StarterLink[], existingUrls: string[]): StarterPlan {
  const key = (u: string) => u.trim().toLowerCase().replace(/\/+$/, "");
  const have = new Set(existingUrls.map(key));
  const chosen = new Set(picked.map((l) => key(l.url)));
  const plan: StarterPlan = [];
  for (const g of STARTER_GROUPS) {
    const links = g.links.filter((l) => chosen.has(key(l.url)) && !have.has(key(l.url)));
    if (links.length) plan.push({ folder: g.name, links });
  }
  return plan;
}
