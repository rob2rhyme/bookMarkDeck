// Interest topics for the "Need a push?" card. The card adapts to the user's
// chosen interests (FocusSettings.interests): quotes are drawn from the matching
// topic pools, the coding nugget/challenge show only for code-leaning interests,
// and an interactive quiz pulls questions from the selected topics.
//
// Framework-free (no React/Firebase) so the data layer and pure logic can import
// it freely. Content is curated + bundled — instant, offline, no external API.
// The large per-topic quiz/quote banks live in ./quizBank (+ ./quiz/*).

import type { Quote } from "@/features/focus/lib/content";
import { QUIZZES, TOPIC_QUOTES } from "@/features/focus/lib/quizBank";

export type TopicId =
  | "general"
  | "coding"
  | "music"
  | "math"
  | "astronomy"
  | "science"
  | "nature"
  | "geography"
  | "history"
  | "words";

export type Topic = { id: TopicId; label: string; emoji: string };

export const TOPICS: readonly Topic[] = [
  { id: "general", label: "General", emoji: "✨" },
  { id: "coding", label: "Coding", emoji: "💻" },
  { id: "music", label: "Music", emoji: "🎵" },
  { id: "math", label: "Math", emoji: "➗" },
  { id: "astronomy", label: "Astronomy", emoji: "🪐" },
  { id: "science", label: "Science", emoji: "🔬" },
  { id: "nature", label: "Nature", emoji: "🐾" },
  { id: "geography", label: "Geography", emoji: "🌍" },
  { id: "history", label: "History", emoji: "🏛️" },
  { id: "words", label: "Words", emoji: "🔤" },
];

const TOPIC_BY_ID: Record<TopicId, Topic> = Object.fromEntries(
  TOPICS.map((t) => [t.id, t])
) as Record<TopicId, Topic>;

const TOPIC_IDS: ReadonlySet<string> = new Set(TOPICS.map((t) => t.id));

export function isTopicId(v: unknown): v is TopicId {
  return typeof v === "string" && TOPIC_IDS.has(v);
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

/** Quizzes drawn from the user's active topics (random order is up to callers). */
export function quizzesFor(interests: readonly TopicId[] | undefined): Quiz[] {
  const active = activeTopics(interests);
  const pool = QUIZZES.filter((q) => active.has(q.topic));
  return pool.length > 0 ? pool : [...QUIZZES];
}

/* ---------------------------------------------------------------- quotes --- */

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
