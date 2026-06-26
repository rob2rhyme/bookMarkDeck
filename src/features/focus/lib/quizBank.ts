// Assembled quiz + topic-quote banks. The per-topic content lives in ./quiz/*
// data files (curated, bundled, offline — ~60 questions + 15 quotes per topic);
// this module concatenates them so the rest of the app imports a single QUIZZES
// list and a single TOPIC_QUOTES map.

import type { Quote } from "@/features/focus/lib/content";
import type { Quiz, TopicId } from "@/features/focus/lib/topics";

import {
  MUSIC_QUIZZES,
  MATH_QUIZZES,
  MUSIC_QUOTES,
  MATH_QUOTES,
} from "@/features/focus/lib/quiz/musicMath";
import {
  ASTRONOMY_QUIZZES,
  SCIENCE_QUIZZES,
  ASTRONOMY_QUOTES,
  SCIENCE_QUOTES,
} from "@/features/focus/lib/quiz/astronomyScience";
import {
  NATURE_QUIZZES,
  GEOGRAPHY_QUIZZES,
  NATURE_QUOTES,
  GEOGRAPHY_QUOTES,
} from "@/features/focus/lib/quiz/natureGeography";
import {
  HISTORY_QUIZZES,
  WORDS_QUIZZES,
  HISTORY_QUOTES,
  WORDS_QUOTES,
} from "@/features/focus/lib/quiz/historyWords";
import {
  CODING_QUIZZES,
  GENERAL_QUIZZES,
  CODING_QUOTES,
  GENERAL_QUOTES,
} from "@/features/focus/lib/quiz/codingGeneral";

export const QUIZZES: readonly Quiz[] = [
  ...MUSIC_QUIZZES,
  ...MATH_QUIZZES,
  ...ASTRONOMY_QUIZZES,
  ...SCIENCE_QUIZZES,
  ...NATURE_QUIZZES,
  ...GEOGRAPHY_QUIZZES,
  ...HISTORY_QUIZZES,
  ...WORDS_QUIZZES,
  ...CODING_QUIZZES,
  ...GENERAL_QUIZZES,
];

export const TOPIC_QUOTES: Partial<Record<TopicId, Quote[]>> = {
  music: MUSIC_QUOTES,
  math: MATH_QUOTES,
  astronomy: ASTRONOMY_QUOTES,
  science: SCIENCE_QUOTES,
  nature: NATURE_QUOTES,
  geography: GEOGRAPHY_QUOTES,
  history: HISTORY_QUOTES,
  words: WORDS_QUOTES,
  coding: CODING_QUOTES,
  general: GENERAL_QUOTES,
};
