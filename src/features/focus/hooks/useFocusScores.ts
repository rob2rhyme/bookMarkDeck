"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  logScore,
  subscribeScores,
} from "@/features/focus/data/focusData";
import type { ScoreRecord } from "@/features/focus/lib/types";
import { todayKey } from "@/lib/dayKey";

export type QuizResult = {
  topic: string;
  level: string;
  correct: boolean;
  points: number;
  question: string;
};

/**
 * Quiz scores history (Firestore-only, like the activity log). `record` is
 * optimistic — it shows instantly, then the live snapshot replaces it with the
 * server copy. Returns aggregates for the Scores panel.
 */
export function useFocusScores(email?: string | null, connected = false) {
  const [scores, setScores] = useState<ScoreRecord[]>([]);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    if (!canSync || !email) {
      setScores([]);
      return;
    }
    return subscribeScores(email, setScores);
  }, [canSync, email]);

  const record = useCallback(
    (result: QuizResult, day = todayKey()) => {
      if (!canSync || !email) return;
      const rec = { ...result, day };
      const optimistic: ScoreRecord = {
        id: crypto.randomUUID(),
        ...rec,
        createdAt: new Date().toISOString(),
      };
      setScores((prev) => [optimistic, ...prev]);
      logScore(email, rec).catch(() => {});
    },
    [canSync, email]
  );

  const total = useMemo(
    () => scores.reduce((sum, s) => sum + (s.points || 0), 0),
    [scores]
  );

  const byTopic = useMemo(() => {
    const map = new Map<string, { points: number; correct: number; answered: number }>();
    for (const s of scores) {
      const cur = map.get(s.topic) ?? { points: 0, correct: 0, answered: 0 };
      cur.points += s.points || 0;
      cur.answered += 1;
      if (s.correct) cur.correct += 1;
      map.set(s.topic, cur);
    }
    return map;
  }, [scores]);

  const answered = scores.length;
  const correctCount = useMemo(
    () => scores.filter((s) => s.correct).length,
    [scores]
  );

  return { scores, total, byTopic, answered, correctCount, record };
}
