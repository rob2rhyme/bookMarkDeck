import { ScrollView } from "react-native";

import { EmptyState } from "@/ui";

export default function InsightsScreen() {
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 gap-4">
      <EmptyState
        emoji="📈"
        title="Insights appear as you add things"
        body="Once you have a few items, this shows what you own by category and location, what it's worth, and what needs attention."
      />
    </ScrollView>
  );
}
