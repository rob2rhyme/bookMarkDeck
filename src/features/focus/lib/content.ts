// Inspirational content for the "Need a push?" card: quotes, code-of-the-day
// nuggets, and daily challenges. These are the built-in DEFAULTS — always
// present and instant. The app also fetches per-user extras from Firestore
// (users/{uid}/focusContent/content) and merges them on top (see useFocusContent),
// so the lists can grow without a deploy.

export type Quote = { text: string; author: string | null };

export type Nugget =
  | { kind: "snippet"; lang: string; code: string; note: string }
  | { kind: "tip"; note: string }
  | { kind: "shortcut"; keys: string; note: string };

export type Challenge = {
  level: "Easy" | "Medium" | "Hard";
  prompt: string;
  solution?: string; // reference solution (revealable in the UI)
};

export type FocusContent = {
  quotes: Quote[];
  nuggets: Nugget[];
  challenges: Challenge[];
};

export const KIND_BADGE: Record<Nugget["kind"], { label: string; cls: string }> = {
  snippet: { label: "Snippet", cls: "border-emerald-500/40 text-emerald-300" },
  tip: { label: "Tip", cls: "border-sky-500/40 text-sky-300" },
  shortcut: { label: "Shortcut", cls: "border-violet-500/40 text-violet-300" },
};

export const LEVEL_BADGE: Record<Challenge["level"], string> = {
  Easy: "border-emerald-500/40 text-emerald-300",
  Medium: "border-amber-500/40 text-amber-300",
  Hard: "border-rose-500/40 text-rose-300",
};

/** Day-of-year (1–366), for picking a stable "of the day" item. */
export function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

export const DEFAULT_QUOTES: Quote[] = [
  { text: "Progress, not perfection. One function at a time.", author: null },
  { text: "The only way to go fast is to go well.", author: "Robert C. Martin" },
  { text: "Momentum builds in 25-minute chunks. Start the clock.", author: null },
  {
    text: "You don't have to be great to start, but you have to start to be great.",
    author: null,
  },
  { text: "Every expert was once a beginner staring at a blank file.", author: null },
  { text: "Shipping something beats perfecting nothing.", author: null },
  { text: "Small steps every day outpace big leaps every month.", author: null },
  {
    text: "Context switching is the enemy. Close the tabs. Do the work.",
    author: null,
  },
  {
    text: "Distraction is a habit. So is focus. Train the better one.",
    author: null,
  },
  {
    text: "Don't watch the clock; do what it does. Keep going.",
    author: "Sam Levenson",
  },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  {
    text: "Programs must be written for people to read, and only incidentally for machines to execute.",
    author: "Harold Abelson",
  },
  {
    text: "Any fool can write code a computer understands. Good programmers write code humans understand.",
    author: "Martin Fowler",
  },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  { text: "Premature optimization is the root of all evil.", author: "Donald Knuth" },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
  { text: "Deleted code is debugged code.", author: "Jeff Sickel" },
  { text: "The best error message is the one that never shows up.", author: "Thomas Fuchs" },
  { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
  {
    text: "The function of good software is to make the complex appear simple.",
    author: "Grady Booch",
  },
  { text: "Done is better than perfect.", author: null },
  { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { text: "Well begun is half done.", author: "Aristotle" },
  {
    text: "Amateurs sit and wait for inspiration; the rest of us just get up and go to work.",
    author: "Stephen King",
  },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "A year from now you may wish you had started today.", author: "Karen Lamb" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "Slow is smooth, and smooth is fast.", author: null },
  {
    text: "Discipline is choosing between what you want now and what you want most.",
    author: null,
  },
  { text: "Focus is the art of knowing what to ignore.", author: null },
  { text: "You can't improve what you never finish.", author: null },
  { text: "Make the change easy, then make the easy change.", author: "Kent Beck" },
  { text: "Fall in love with the process, and the results will follow.", author: null },
  { text: "When in doubt, ship a smaller thing.", author: null },
  { text: "Code never lies; comments sometimes do.", author: "Ron Jeffries" },
  { text: "Good code is its own best documentation.", author: "Steve McConnell" },
  {
    text: "Before software can be reusable it first has to be usable.",
    author: "Ralph Johnson",
  },
  {
    text: "Testing leads to failure, and failure leads to understanding.",
    author: "Burt Rutan",
  },
  {
    text: "Perfection is achieved when there is nothing left to take away.",
    author: "Antoine de Saint-Exupéry",
  },
  {
    text: "Inspiration is for amateurs. The rest of us just show up and get to work.",
    author: "Chuck Close",
  },
  { text: "Motivation gets you going; habit keeps you growing.", author: null },
  { text: "The deep work is where the magic is. Protect it.", author: null },
];

export const DEFAULT_NUGGETS: Nugget[] = [
  // snippets
  { kind: "snippet", lang: "js", code: "const unique = [...new Set(arr)];", note: "Dedupe an array in one line." },
  { kind: "snippet", lang: "js", code: "const last = arr.at(-1);", note: "Grab the last item — no length math." },
  { kind: "snippet", lang: "js", code: "const copy = structuredClone(obj);", note: "Deep-clone without a JSON round-trip." },
  { kind: "snippet", lang: "js", code: "await Promise.allSettled(tasks);", note: "Wait for everything — successes and failures alike." },
  { kind: "snippet", lang: "js", code: "const sum = nums.reduce((a, b) => a + b, 0);", note: "Total a list of numbers." },
  { kind: "snippet", lang: "js", code: "[...nums].sort((a, b) => a - b);", note: "Sort numbers correctly — the default sort is alphabetical!" },
  { kind: "snippet", lang: "js", code: 'String(n).padStart(2, "0");', note: "Zero-pad a value for clocks and dates." },
  { kind: "snippet", lang: "js", code: "Object.groupBy(items, (x) => x.type);", note: "Group a list by a key — no lodash needed." },
  { kind: "snippet", lang: "js", code: "Array.from({ length: n }, (_, i) => i);", note: "Build a 0..n-1 range." },
  { kind: "snippet", lang: "js", code: "const evens = arr.filter((n) => n % 2 === 0);", note: "Keep only the items that match." },
  { kind: "snippet", lang: "js", code: "items.flatMap((x) => x.tags);", note: "Map and flatten in a single pass." },
  { kind: "snippet", lang: "js", code: "arr.findLast((x) => x.active);", note: "Search from the end of an array." },
  { kind: "snippet", lang: "ts", code: "const cfg = base satisfies Config;", note: "Type-check a value without widening its literal type." },
  { kind: "snippet", lang: "css", code: "text-wrap: balance;", note: "Even line lengths on headings — no manual breaks." },
  { kind: "snippet", lang: "css", code: "aspect-ratio: 16 / 9;", note: "Lock an element's shape without padding hacks." },
  { kind: "snippet", lang: "bash", code: "git commit --amend --no-edit", note: "Fold staged changes into your last commit, message untouched." },
  { kind: "snippet", lang: "bash", code: "git switch -c feature/x", note: "Create a branch and switch to it in one step." },
  { kind: "snippet", lang: "bash", code: "git restore --staged <file>", note: "Unstage a file without losing your changes." },
  { kind: "snippet", lang: "bash", code: "git stash -u", note: "Stash your work including untracked files." },
  // tips
  { kind: "tip", note: "Name booleans as questions — isReady, hasAccess — so conditionals read like plain English." },
  { kind: "tip", note: "Commit small. A diff you can hold in your head is a diff you can actually review." },
  { kind: "tip", note: "Write the test that would have caught the bug first, then fix the bug." },
  { kind: "tip", note: "If a function needs a comment to explain what it does, try a better name first." },
  { kind: "tip", note: "Prefer pure functions — same input, same output — they're trivial to test and reason about." },
  { kind: "tip", note: "Read the error message. Then read it again. The answer is usually right there." },
  { kind: "tip", note: "Rubber-duck it: explain the bug out loud and you'll often spot it yourself." },
  { kind: "tip", note: "Optimize for deletion. Code that's easy to delete is code that's easy to change." },
  { kind: "tip", note: "When you're stuck, take a walk. Your subconscious keeps compiling in the background." },
  { kind: "tip", note: "Leave the code a little better than you found it — the boy-scout rule." },
  { kind: "tip", note: "If it's hard to test, it's probably hard to use. Fix the design, not the test." },
  // shortcuts
  { kind: "shortcut", keys: "⌘⇧P  /  Ctrl⇧P", note: "Command Palette — reach any editor action without leaving the keyboard." },
  { kind: "shortcut", keys: "⌥↑  /  ⌥↓", note: "Move the current line up or down (VS Code)." },
  { kind: "shortcut", keys: "F2", note: "Rename a symbol everywhere at once (VS Code)." },
  { kind: "shortcut", keys: "⌘D  /  Ctrl+D", note: "Select the next match for multi-cursor editing." },
  { kind: "shortcut", keys: "⌘/  /  Ctrl+/", note: "Toggle a line comment on the current selection." },
  { kind: "shortcut", keys: "⌘P  /  Ctrl+P", note: "Quick-open any file by name." },
  { kind: "shortcut", keys: "Ctrl + `", note: "Toggle the integrated terminal (VS Code)." },
  { kind: "shortcut", keys: "Ctrl + R", note: "Reverse-search your shell history instead of re-typing." },
  { kind: "shortcut", keys: "cd -", note: "Jump back to the directory you were just in." },
  { kind: "shortcut", keys: "sudo !!", note: "Re-run your last command with sudo — !! repeats it." },
];

export const DEFAULT_CHALLENGES: Challenge[] = [
  {
    level: "Easy",
    prompt: "Reverse a string without using .reverse().",
    solution: 'const reverse = (s) =>\n  [...s].reduce((rev, c) => c + rev, "");',
  },
  {
    level: "Easy",
    prompt: "Write FizzBuzz for 1–100 in five lines or fewer.",
    solution:
      'for (let i = 1; i <= 100; i++)\n  console.log(\n    i % 15 ? (i % 3 ? (i % 5 ? i : "Buzz") : "Fizz") : "FizzBuzz"\n  );',
  },
  {
    level: "Easy",
    prompt: "Check whether two strings are anagrams of each other.",
    solution:
      'const isAnagram = (a, b) =>\n  [...a].sort().join("") === [...b].sort().join("");',
  },
  {
    level: "Easy",
    prompt: "Group an array of objects by one of their keys — no libraries.",
    solution:
      "const groupBy = (arr, key) =>\n  arr.reduce((acc, x) => ((acc[x[key]] ??= []).push(x), acc), {});",
  },
  {
    level: "Easy",
    prompt: "Sum every number in a deeply nested array.",
    solution:
      "const deepSum = (a) =>\n  a.reduce((s, x) => s + (Array.isArray(x) ? deepSum(x) : x), 0);",
  },
  {
    level: "Easy",
    prompt: "Count the vowels in a string.",
    solution: "const countVowels = (s) => (s.match(/[aeiou]/gi) ?? []).length;",
  },
  {
    level: "Easy",
    prompt: "Capitalize the first letter of every word in a sentence.",
    solution:
      "const titleCase = (s) =>\n  s.replace(/\\b\\w/g, (c) => c.toUpperCase());",
  },
  {
    level: "Medium",
    prompt: "Find the first non-repeating character in a string.",
    solution:
      "const firstUnique = (s) => {\n  const n = {};\n  for (const c of s) n[c] = (n[c] ?? 0) + 1;\n  return [...s].find((c) => n[c] === 1) ?? null;\n};",
  },
  {
    level: "Medium",
    prompt: "Flatten a deeply nested array without Array.prototype.flat.",
    solution:
      "const flatten = (a) =>\n  a.reduce((r, x) => r.concat(Array.isArray(x) ? flatten(x) : x), []);",
  },
  {
    level: "Medium",
    prompt: "Write a debounce(fn, ms) helper in under ten lines.",
    solution:
      "const debounce = (fn, ms) => {\n  let t;\n  return (...args) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), ms);\n  };\n};",
  },
  {
    level: "Medium",
    prompt: "Given an array and a target, return the two indices that sum to it.",
    solution:
      "const twoSum = (nums, target) => {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const need = target - nums[i];\n    if (seen.has(need)) return [seen.get(need), i];\n    seen.set(nums[i], i);\n  }\n};",
  },
  {
    level: "Medium",
    prompt: "Decide if a string of (), [], {} brackets is balanced.",
    solution:
      'const balanced = (s) => {\n  const pairs = { ")": "(", "]": "[", "}": "{" };\n  const stack = [];\n  for (const c of s) {\n    if ("([{".includes(c)) stack.push(c);\n    else if (stack.pop() !== pairs[c]) return false;\n  }\n  return stack.length === 0;\n};',
  },
  {
    level: "Medium",
    prompt: "Memoize a single-argument pure function.",
    solution:
      "const memoize = (fn) => {\n  const cache = new Map();\n  return (x) => {\n    if (!cache.has(x)) cache.set(x, fn(x));\n    return cache.get(x);\n  };\n};",
  },
  {
    level: "Medium",
    prompt: "Implement Array.prototype.map from scratch.",
    solution:
      "const map = (arr, fn) => {\n  const out = [];\n  for (let i = 0; i < arr.length; i++) out.push(fn(arr[i], i, arr));\n  return out;\n};",
  },
  {
    level: "Medium",
    prompt: "Find the longest word in a sentence.",
    solution:
      'const longest = (s) =>\n  s.split(/\\s+/).reduce((a, b) => (b.length > a.length ? b : a), "");',
  },
  {
    level: "Hard",
    prompt: "Convert an integer (1–3999) to its Roman numeral.",
    solution:
      'const toRoman = (n) => {\n  const map = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];\n  let out = "";\n  for (const [v, sym] of map) while (n >= v) { out += sym; n -= v; }\n  return out;\n};',
  },
  {
    level: "Hard",
    prompt: "Implement a tiny LRU cache with O(1) get and set.",
    solution:
      "class LRU {\n  constructor(cap) { this.cap = cap; this.map = new Map(); }\n  get(k) {\n    if (!this.map.has(k)) return undefined;\n    const v = this.map.get(k);\n    this.map.delete(k); this.map.set(k, v);\n    return v;\n  }\n  set(k, v) {\n    this.map.delete(k); this.map.set(k, v);\n    if (this.map.size > this.cap)\n      this.map.delete(this.map.keys().next().value);\n  }\n}",
  },
  {
    level: "Hard",
    prompt: "Flatten and sort an arbitrarily nested array of numbers.",
    solution:
      "const flatSort = (a) => a.flat(Infinity).sort((x, y) => x - y);",
  },
];

export const DEFAULT_CONTENT: FocusContent = {
  quotes: DEFAULT_QUOTES,
  nuggets: DEFAULT_NUGGETS,
  challenges: DEFAULT_CHALLENGES,
};

/* ---- validators for untrusted Firestore data ---- */

export function isQuote(v: unknown): v is Quote {
  if (!v || typeof v !== "object") return false;
  const q = v as Record<string, unknown>;
  return (
    typeof q.text === "string" &&
    q.text.trim().length > 0 &&
    (q.author === null || typeof q.author === "string" || q.author === undefined)
  );
}

export function isNugget(v: unknown): v is Nugget {
  if (!v || typeof v !== "object") return false;
  const n = v as Record<string, unknown>;
  if (n.kind === "snippet")
    return typeof n.code === "string" && typeof n.note === "string";
  if (n.kind === "tip") return typeof n.note === "string";
  if (n.kind === "shortcut")
    return typeof n.keys === "string" && typeof n.note === "string";
  return false;
}

export function isChallenge(v: unknown): v is Challenge {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    (c.level === "Easy" || c.level === "Medium" || c.level === "Hard") &&
    typeof c.prompt === "string" &&
    c.prompt.trim().length > 0 &&
    (c.solution === undefined || typeof c.solution === "string")
  );
}

/** Merge built-in defaults with user-supplied (untrusted) extras, de-duplicated. */
export function mergeContent(
  extra: {
    quotes?: unknown[];
    nuggets?: unknown[];
    challenges?: unknown[];
  } | null
): FocusContent {
  const quoteKey = (q: Quote) => q.text;
  const nuggetKey = (n: Nugget) =>
    n.kind === "snippet" ? n.code : n.kind === "shortcut" ? n.keys : n.note;
  const challengeKey = (c: Challenge) => c.prompt;

  const dedupe = <T>(base: T[], add: T[] | undefined, key: (t: T) => string): T[] => {
    if (!add || add.length === 0) return base;
    const seen = new Set(base.map(key));
    return [...base, ...add.filter((x) => !seen.has(key(x)))];
  };

  return {
    quotes: dedupe(DEFAULT_QUOTES, extra?.quotes?.filter(isQuote), quoteKey),
    nuggets: dedupe(DEFAULT_NUGGETS, extra?.nuggets?.filter(isNugget), nuggetKey),
    challenges: dedupe(
      DEFAULT_CHALLENGES,
      extra?.challenges?.filter(isChallenge),
      challengeKey
    ),
  };
}
