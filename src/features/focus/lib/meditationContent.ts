// Bundled, offline meditation guide scripts — short, readable step lists shown
// in the Meditation card. No streaming audio or third-party SDK (same offline
// ethos as the quiz/quote banks).

export type MeditationGuide = {
  id: string;
  title: string;
  blurb: string;
  minutes: number; // suggested length
  steps: string[];
};

export const MEDITATION_GUIDES: readonly MeditationGuide[] = [
  {
    id: "breath-focus",
    title: "Breath focus",
    blurb: "Settle a busy mind by resting attention on the breath.",
    minutes: 5,
    steps: [
      "Sit comfortably and let your shoulders drop.",
      "Close your eyes or soften your gaze downward.",
      "Notice the breath where you feel it most — nose, chest, or belly.",
      "Don't change it; just follow each in-breath and out-breath.",
      "When the mind wanders, gently label it 'thinking' and return to the breath.",
      "Finish with three slower breaths, then open your eyes.",
    ],
  },
  {
    id: "body-scan",
    title: "Body scan",
    blurb: "Release tension by moving attention through the body.",
    minutes: 10,
    steps: [
      "Lie down or sit, and take a few easy breaths.",
      "Bring attention to your feet — notice any sensation, without judging.",
      "Slowly move up: calves, knees, thighs, hips.",
      "Continue through belly, chest, hands, arms, and shoulders.",
      "Soften the neck, jaw, and the muscles around the eyes.",
      "Rest for a moment aware of the whole body breathing.",
    ],
  },
  {
    id: "gratitude",
    title: "Gratitude pause",
    blurb: "A short reset that shifts attention toward the good.",
    minutes: 3,
    steps: [
      "Take three slow breaths to arrive.",
      "Bring to mind one small thing that went well today.",
      "Picture it clearly and notice how it feels in the body.",
      "Silently say thank you for it.",
      "Repeat with one more thing, however ordinary.",
      "Carry that warmth with you as you return.",
    ],
  },
  {
    id: "loving-kindness",
    title: "Loving-kindness",
    blurb: "Warm up your mood with a few good wishes.",
    minutes: 5,
    steps: [
      "Sit comfortably and breathe naturally.",
      "Silently wish yourself: may I be well, may I be at ease.",
      "Bring to mind someone you care about and offer the same wish.",
      "Extend it to someone neutral — a stranger you saw today.",
      "If it feels right, include someone you find difficult.",
      "End by wishing well to all beings everywhere.",
    ],
  },
  {
    id: "focus-reset",
    title: "Focus reset",
    blurb: "A quick clear-out before a deep-work block.",
    minutes: 3,
    steps: [
      "Sit upright and take one long, slow exhale.",
      "Name the single task you're about to start.",
      "Picture finishing it — what 'done' looks like.",
      "Let other open loops go for now; they'll keep.",
      "Take three steady breaths, counting each one.",
      "Open your eyes and begin with that one task.",
    ],
  },
  {
    id: "stress-release",
    title: "Stress release",
    blurb: "Soften a tight, wound-up body and mind.",
    minutes: 5,
    steps: [
      "Sit or stand and breathe out fully through the mouth.",
      "Notice where stress sits — jaw, shoulders, chest, or gut.",
      "Breathe in for four, then out slowly for six.",
      "On each exhale, let that tight area drop a little.",
      "Unclench the jaw and let the shoulders fall.",
      "Finish with one easy breath and a slower pace.",
    ],
  },
  {
    id: "sleep-winddown",
    title: "Sleep wind-down",
    blurb: "Ease the body toward rest at the end of the day.",
    minutes: 5,
    steps: [
      "Lie down and let the bed take your full weight.",
      "Breathe low into the belly, slow and quiet.",
      "Relax the face, then the neck and shoulders.",
      "Let the arms and legs feel heavy and warm.",
      "If thoughts come, picture them drifting away.",
      "Stay with the slow breath and let sleep come.",
    ],
  },
];

export function guideById(id: string): MeditationGuide | undefined {
  return MEDITATION_GUIDES.find((g) => g.id === id);
}
