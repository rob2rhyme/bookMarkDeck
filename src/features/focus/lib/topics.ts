// Interest topics for the "Need a push?" card. The card adapts to the user's
// chosen interests (FocusSettings.interests): quotes are drawn from the matching
// topic pools, the coding nugget/challenge show only for code-leaning interests,
// and an interactive quiz pulls questions from the selected topics.
//
// Framework-free (no React/Firebase) so the data layer and pure logic can import
// it freely. Content is curated + bundled — instant, offline, no external API.

import type { Quote } from "@/features/focus/lib/content";

export type TopicId = "general" | "coding" | "music" | "math" | "astronomy";

export type Topic = { id: TopicId; label: string; emoji: string };

export const TOPICS: readonly Topic[] = [
  { id: "general", label: "General", emoji: "✨" },
  { id: "coding", label: "Coding", emoji: "💻" },
  { id: "music", label: "Music", emoji: "🎵" },
  { id: "math", label: "Math", emoji: "➗" },
  { id: "astronomy", label: "Astronomy", emoji: "🪐" },
];

const TOPIC_BY_ID: Record<TopicId, Topic> = Object.fromEntries(
  TOPICS.map((t) => [t.id, t])
) as Record<TopicId, Topic>;

export function isTopicId(v: unknown): v is TopicId {
  return (
    v === "general" ||
    v === "coding" ||
    v === "music" ||
    v === "math" ||
    v === "astronomy"
  );
}

export function topicLabel(id: TopicId): string {
  return TOPIC_BY_ID[id]?.label ?? id;
}

export function topicEmoji(id: TopicId): string {
  return TOPIC_BY_ID[id]?.emoji ?? "✨";
}

/**
 * Which topics are "active" for a given interests list. Empty interests keeps
 * the original audience (coding + general) so existing users see no change.
 */
export function activeTopics(interests: readonly TopicId[] | undefined): Set<TopicId> {
  if (!interests || interests.length === 0) return new Set(["coding", "general"]);
  return new Set(interests.filter(isTopicId));
}

/** True when code-flavoured blocks (nugget, challenge) make sense to show. */
export function showsCoding(interests: readonly TopicId[] | undefined): boolean {
  const active = activeTopics(interests);
  return active.has("coding") || active.has("general");
}

/* --------------------------------------------------------------- quizzes --- */

export type QuizLevel = "Easy" | "Medium" | "Hard";

export type Quiz = {
  topic: TopicId;
  level: QuizLevel;
  question: string;
  choices: string[]; // 2–4 options
  answer: number; // index into choices
  explain?: string; // shown after answering
};

/** Points awarded for a correct answer, by difficulty. */
export const POINTS: Record<QuizLevel, number> = { Easy: 10, Medium: 20, Hard: 30 };

export const QUIZZES: readonly Quiz[] = [
  // ---- Music ----
  { topic: "music", level: "Easy", question: "How many strings does a standard guitar have?", choices: ["4", "5", "6", "7"], answer: 2 },
  { topic: "music", level: "Easy", question: "Which instrument has black and white keys?", choices: ["Piano", "Drum", "Harp", "Cello"], answer: 0 },
  { topic: "music", level: "Easy", question: "Which instrument do you play by hitting it?", choices: ["Drum", "Flute", "Violin", "Trumpet"], answer: 0 },
  { topic: "music", level: "Easy", question: "A big group of musicians playing together is called an…?", choices: ["Orchestra", "Audience", "Stadium", "Library"], answer: 0 },
  { topic: "music", level: "Medium", question: "How many beats does a whole note get in 4/4 time?", choices: ["1", "2", "3", "4"], answer: 3 },
  { topic: "music", level: "Medium", question: "The trumpet belongs to which family of instruments?", choices: ["Brass", "String", "Woodwind", "Percussion"], answer: 0 },
  { topic: "music", level: "Medium", question: "The musical alphabet runs from A up to which letter?", choices: ["E", "F", "G", "H"], answer: 2 },
  { topic: "music", level: "Medium", question: "How many lines make up a music staff?", choices: ["4", "5", "6", "7"], answer: 1 },
  { topic: "music", level: "Medium", question: "What word means the speed of a piece of music?", choices: ["Tempo", "Pitch", "Chord", "Lyric"], answer: 0 },
  { topic: "music", level: "Medium", question: "In music, what does \"piano\" tell you to play?", choices: ["Softly", "Loudly", "Faster", "Slower"], answer: 0, explain: "\"Piano\" (p) means soft; \"forte\" (f) means loud." },

  // ---- Math ----
  { topic: "math", level: "Easy", question: "What is 7 + 8?", choices: ["13", "14", "15", "16"], answer: 2 },
  { topic: "math", level: "Easy", question: "How many sides does a hexagon have?", choices: ["5", "6", "7", "8"], answer: 1 },
  { topic: "math", level: "Easy", question: "What is half of 50?", choices: ["20", "25", "30", "15"], answer: 1 },
  { topic: "math", level: "Easy", question: "How many minutes are in an hour?", choices: ["30", "60", "90", "100"], answer: 1 },
  { topic: "math", level: "Easy", question: "How many angles does a triangle have?", choices: ["2", "3", "4", "5"], answer: 1 },
  { topic: "math", level: "Medium", question: "What is 9 × 6?", choices: ["54", "56", "63", "45"], answer: 0 },
  { topic: "math", level: "Medium", question: "Which of these numbers is prime?", choices: ["9", "15", "17", "21"], answer: 2, explain: "17 has no factors besides 1 and itself." },
  { topic: "math", level: "Medium", question: "What is 100 − 37?", choices: ["63", "73", "67", "57"], answer: 0 },
  { topic: "math", level: "Medium", question: "What is 12 × 12?", choices: ["124", "132", "144", "121"], answer: 2 },
  { topic: "math", level: "Medium", question: "Which fraction is the largest?", choices: ["1/2", "1/3", "1/4", "1/8"], answer: 0 },
  { topic: "math", level: "Medium", question: "What is 6 squared (6 × 6)?", choices: ["12", "30", "36", "18"], answer: 2 },
  { topic: "math", level: "Medium", question: "Round 47 to the nearest ten.", choices: ["40", "45", "50", "47"], answer: 2 },

  // ---- Astronomy ----
  { topic: "astronomy", level: "Easy", question: "Which planet is closest to the Sun?", choices: ["Mercury", "Venus", "Earth", "Mars"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "What is the name of our galaxy?", choices: ["Milky Way", "Andromeda", "Orion", "Solaris"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "Which planet is known as the Red Planet?", choices: ["Mars", "Jupiter", "Saturn", "Venus"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "Which planet is famous for its bright rings?", choices: ["Saturn", "Mars", "Earth", "Mercury"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "How many planets are in our Solar System?", choices: ["7", "8", "9", "10"], answer: 1 },
  { topic: "astronomy", level: "Easy", question: "Earth's natural satellite is called the…?", choices: ["Moon", "Sun", "Comet", "Station"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "Which is the largest planet in our Solar System?", choices: ["Jupiter", "Saturn", "Earth", "Neptune"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "How long does Earth take to orbit the Sun once?", choices: ["One day", "One month", "One year", "Ten years"], answer: 2 },
  { topic: "astronomy", level: "Medium", question: "What is the closest star to Earth?", choices: ["The Sun", "Polaris", "Sirius", "Proxima Centauri"], answer: 0, explain: "The Sun is a star — and by far our nearest one." },
  { topic: "astronomy", level: "Medium", question: "What do we call a space rock that burns up in Earth's sky?", choices: ["Meteor", "Comet", "Asteroid", "Planet"], answer: 0 },
  { topic: "astronomy", level: "Medium", question: "What force keeps the planets orbiting the Sun?", choices: ["Gravity", "Magnetism", "Wind", "Friction"], answer: 0 },
  { topic: "astronomy", level: "Hard", question: "The Sun is mostly made of which gas?", choices: ["Hydrogen", "Oxygen", "Carbon", "Nitrogen"], answer: 0 },

  // ---- Coding ----
  { topic: "coding", level: "Easy", question: "What does HTML stand for?", choices: ["HyperText Markup Language", "High Tech Modern Language", "Hyperlink Text Mode", "Home Tool Markup Language"], answer: 0 },
  { topic: "coding", level: "Easy", question: "Which symbol starts a single-line comment in JavaScript?", choices: ["//", "/*", "#", "--"], answer: 0 },
  { topic: "coding", level: "Easy", question: "What does CSS mainly control on a web page?", choices: ["Appearance / styling", "The database", "The server", "Network speed"], answer: 0 },
  { topic: "coding", level: "Easy", question: "What does API stand for?", choices: ["Application Programming Interface", "Applied Process Index", "Automated Program Input", "Active Page Item"], answer: 0 },
  { topic: "coding", level: "Medium", question: "Which is NOT a primitive JavaScript type?", choices: ["Array", "Number", "Boolean", "String"], answer: 0, explain: "Arrays are objects; number, boolean and string are primitives." },
  { topic: "coding", level: "Medium", question: "What does === check in JavaScript?", choices: ["Value and type", "Only value", "Assignment", "Inequality"], answer: 0 },
  { topic: "coding", level: "Medium", question: "Which keyword declares a block-scoped variable?", choices: ["let", "var", "global", "def"], answer: 0 },
  { topic: "coding", level: "Medium", question: "Which data structure is LIFO (last in, first out)?", choices: ["Stack", "Queue", "Array", "Tree"], answer: 0 },
  { topic: "coding", level: "Hard", question: "What is the time complexity of binary search?", choices: ["O(log n)", "O(n)", "O(n²)", "O(1)"], answer: 0 },

  // ---- General ----
  { topic: "general", level: "Easy", question: "What color do you get mixing blue and yellow?", choices: ["Green", "Purple", "Orange", "Brown"], answer: 0 },
  { topic: "general", level: "Easy", question: "How many continents are there on Earth?", choices: ["5", "6", "7", "8"], answer: 2 },
  { topic: "general", level: "Easy", question: "Which is the largest ocean?", choices: ["Pacific", "Atlantic", "Indian", "Arctic"], answer: 0 },
  { topic: "general", level: "Easy", question: "How many legs does a spider have?", choices: ["6", "8", "10", "4"], answer: 1 },
  { topic: "general", level: "Easy", question: "How many colors are in a rainbow?", choices: ["5", "6", "7", "8"], answer: 2 },
  { topic: "general", level: "Easy", question: "Which is the tallest land animal?", choices: ["Giraffe", "Elephant", "Horse", "Camel"], answer: 0 },
  { topic: "general", level: "Medium", question: "How many days are in a leap year?", choices: ["365", "366", "364", "360"], answer: 1 },
  { topic: "general", level: "Medium", question: "Which gas do plants take in to make food?", choices: ["Carbon dioxide", "Oxygen", "Helium", "Nitrogen"], answer: 0 },
];

/** Quizzes drawn from the user's active topics (random order is up to callers). */
export function quizzesFor(interests: readonly TopicId[] | undefined): Quiz[] {
  const active = activeTopics(interests);
  const pool = QUIZZES.filter((q) => active.has(q.topic));
  return pool.length > 0 ? pool : [...QUIZZES];
}

/* ---------------------------------------------------------------- quotes --- */

// Topic-flavoured quotes layered on top of the base (coding/productivity) pool.
export const TOPIC_QUOTES: Partial<Record<TopicId, Quote[]>> = {
  music: [
    { text: "Music is the space between the notes.", author: "Claude Debussy" },
    { text: "Where words fail, music speaks.", author: "Hans Christian Andersen" },
    { text: "Practice makes progress — one note at a time.", author: null },
    { text: "Every great musician started by learning a single scale.", author: null },
    { text: "Music gives a soul to the universe and wings to the mind.", author: "Plato" },
    { text: "Keep playing. The wrong notes are how you find the right ones.", author: null },
  ],
  math: [
    { text: "Pure mathematics is, in its way, the poetry of logical ideas.", author: "Albert Einstein" },
    { text: "Mistakes are proof that you are trying.", author: null },
    { text: "Math isn't about being right the first time — it's about not giving up.", author: null },
    { text: "Every problem has a solution; sometimes you just need a new angle.", author: null },
    { text: "Numbers are the building blocks of everything around us.", author: null },
    { text: "It's not that I'm so smart, it's just that I stay with problems longer.", author: "Albert Einstein" },
  ],
  astronomy: [
    { text: "Somewhere, something incredible is waiting to be known.", author: "Carl Sagan" },
    { text: "We are made of star-stuff.", author: "Carl Sagan" },
    { text: "Look up at the stars and not down at your feet.", author: "Stephen Hawking" },
    { text: "The Universe is under no obligation to make sense to you — so stay curious.", author: "Neil deGrasse Tyson" },
    { text: "Shoot for the Moon. Even if you miss, you'll land among the stars.", author: "Norman Vincent Peale" },
    { text: "Across the sea of space, the stars are other suns.", author: "Carl Sagan" },
  ],
};

/**
 * The quote pool for the card: the base (coding/productivity) quotes when a
 * code-leaning interest is active, plus the flavoured quotes for every active
 * topic. Falls back to the base pool so the card is never empty.
 */
export function quotesFor(
  interests: readonly TopicId[] | undefined,
  base: Quote[]
): Quote[] {
  const active = activeTopics(interests);
  const flavoured = (Object.keys(TOPIC_QUOTES) as TopicId[])
    .filter((t) => active.has(t))
    .flatMap((t) => TOPIC_QUOTES[t] ?? []);
  const includeBase = active.has("coding") || active.has("general");
  const pool = includeBase ? [...base, ...flavoured] : flavoured;
  return pool.length > 0 ? pool : base;
}
