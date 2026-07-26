import { router } from "expo-router";
import { ScrollView, View } from "react-native";

import { Button, EmptyState } from "@/ui";

export default function ItemsScreen() {
  // Data layer lands next (src/data/repo.ts behind a repository interface, per
  // the plan) — this screen currently renders the teaching empty state.
  const items: unknown[] = [];

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 gap-4">
      {items.length === 0 ? (
        <EmptyState
          emoji="📦"
          title="Nothing catalogued yet"
          body="Add the things you own so you can find them, remember what they cost, and know when a warranty or use-by date is coming up."
          actionLabel="Add your first item"
          onAction={() => router.push("/add")}
        />
      ) : null}

      <View className="items-center">
        <Button
          label="Scan a barcode"
          variant="secondary"
          onPress={() => router.push("/add")}
          accessibilityHint="Opens the camera to scan a product barcode"
        />
      </View>
    </ScrollView>
  );
}
