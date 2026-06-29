"use client";

// /habits renders the Classic HabitsDashboard. (The beginner-first "Simple" view
// and its toggle were retired — Classic is the single, canonical layout.)

import { HabitsDashboard } from "@/features/habits/components/HabitsDashboard";

export function HabitsRoute() {
  return <HabitsDashboard />;
}

export default HabitsRoute;
