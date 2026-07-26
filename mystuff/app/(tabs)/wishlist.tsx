import { ScrollView } from "react-native";

import { EmptyState } from "@/ui";

export default function WishlistScreen() {
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 gap-4">
      <EmptyState
        emoji="♡"
        title="Nothing on the wishlist"
        body="Save things you're thinking about buying. Compare prices before you commit, and turn a wish into an item once it arrives."
      />
    </ScrollView>
  );
}
