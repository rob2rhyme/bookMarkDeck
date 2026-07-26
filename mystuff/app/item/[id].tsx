import { useLocalSearchParams } from "expo-router";
import { ScrollView } from "react-native";

import { Card } from "@/ui";

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 gap-4">
      <Card title="Item" subtitle={`id: ${id}`}>
        {/* Detail, life history, price comparison and actions land with the
            data layer — see PARITY-CHECKLIST.md. */}
      </Card>
    </ScrollView>
  );
}
