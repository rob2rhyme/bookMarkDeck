import { useMemo, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";

import { useData } from "@/data/provider";
import { locationPathsById } from "@/lib/inventorySearch";
import { ITEM_KINDS } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ListRow } from "@/ui";

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, locations, removeItem } = useData();
  const [busy, setBusy] = useState(false);

  const paths = useMemo(() => locationPathsById(locations), [locations]);
  const item = items.find((i) => i.id === id);

  if (!item) {
    return (
      <>
        <Stack.Screen options={{ title: "Item" }} />
        <View className="flex-1 justify-center bg-canvas">
          <EmptyState
            emoji="🤷"
            title="Item not found"
            body="It may have been deleted. Head back to your list."
            actionLabel="Back to items"
            onAction={() => router.back()}
          />
        </View>
      </>
    );
  }

  const kind = ITEM_KINDS.find((k) => k.id === (item.kind ?? ""));
  const lowStock = item.restockAt != null && item.quantity <= item.restockAt;
  const where = item.locationId
    ? paths[item.locationId]?.join(" / ") ?? "Somewhere that no longer exists"
    : "Not set";

  // Destructive and irreversible, so it asks first — the app's forgiveness rule.
  const confirmDelete = () => {
    Alert.alert("Delete this item?", `"${item.name}" will be removed.`, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await removeItem(item.id);
            router.back();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: item.name }} />
      <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-4 p-4">
        <Card>
          <View className="gap-2">
            <Text className="text-2xl">{kind?.icon ?? "📦"}</Text>
            <Text className="text-xl font-semibold text-ink">{item.name}</Text>
            <View className="flex-row flex-wrap gap-2">
              {kind ? <Badge label={kind.label} tone="accent" /> : null}
              {item.quantity > 1 ? (
                <Badge label={`Quantity ${item.quantity}`} />
              ) : null}
              {lowStock ? <Badge label="Low stock" tone="warn" /> : null}
              {item.archived ? <Badge label="Archived" /> : null}
            </View>
          </View>
        </Card>

        <Card title="Details">
          <View>
            <ListRow
              title="Where it is"
              detail={where}
              onPress={() => router.push(`/item/${item.id}/edit`)}
              accessibilityHint="Opens the edit form to move this item"
            />
            <ListRow title="Quantity" detail={String(item.quantity)} />
            {item.category ? (
              <ListRow title="Category" detail={item.category} />
            ) : null}
            {item.notes ? <ListRow title="Notes" detail={item.notes} /> : null}
            <ListRow
              title="Added"
              detail={
                item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"
              }
            />
          </View>
        </Card>

        {/* Photos, price comparison and the ledgers land next — tracked
            row-by-row in PARITY-CHECKLIST.md. */}
        <View className="gap-2">
          <Button
            label="Edit item"
            onPress={() => router.push(`/item/${item.id}/edit`)}
            fullWidth
            size="lg"
          />
          <Button
            label="Delete item"
            variant="danger"
            onPress={confirmDelete}
            loading={busy}
            fullWidth
          />
        </View>
      </ScrollView>
    </>
  );
}
