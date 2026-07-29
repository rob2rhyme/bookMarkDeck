import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { router } from "expo-router";

import { useData } from "@/data/provider";
import { visibleItems } from "@/lib/filterItems";
import { locationPathsById } from "@/lib/inventorySearch";
import { ITEM_KINDS } from "@/lib/types";
import { Badge, Button, EmptyState, Field, ListRow, Skeleton } from "@/ui";

const iconFor = (kind?: string) =>
  ITEM_KINDS.find((k) => k.id === (kind ?? ""))?.icon ?? "📦";

export default function ItemsScreen() {
  const { items, locations, loading } = useData();
  const [query, setQuery] = useState("");

  const paths = useMemo(() => locationPathsById(locations), [locations]);

  // Same matching + ordering rules as the web app, now pure and tested.
  const visible = useMemo(
    () => visibleItems(items, { query, locationPaths: paths }),
    [items, query, paths]
  );

  // Where a thing is, is the answer this app exists to give — so it goes on
  // the row, not two taps away.
  const detailFor = (locationId: string | null, quantity: number) =>
    [
      locationId ? paths[locationId]?.join(" / ") : undefined,
      quantity > 1 ? `Quantity ${quantity}` : undefined,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  if (loading) {
    return (
      <View className="flex-1 gap-3 bg-canvas p-4">
        <Skeleton height={44} />
        <Skeleton height={64} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View className="flex-1 justify-center bg-canvas">
        <EmptyState
          emoji="📦"
          title="Nothing catalogued yet"
          body="Add the things you own so you can find them, remember what they cost, and know when a warranty or use-by date is coming up."
          actionLabel="Add your first item"
          onAction={() => router.push("/add")}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <View className="gap-3 p-4 pb-2">
        <Field
          label="Search"
          value={query}
          onChangeText={setQuery}
          placeholder="Name, tag, location…"
          returnKeyType="search"
        />
      </View>

      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        contentContainerClassName="px-4 pb-28"
        ItemSeparatorComponent={() => <View className="h-px bg-line" />}
        ListEmptyComponent={
          <EmptyState
            emoji="🔍"
            title="No matches"
            body={`Nothing matches "${query.trim()}". Try a shorter word, or clear the search.`}
          />
        }
        renderItem={({ item }) => (
          <ListRow
            title={`${iconFor(item.kind)}  ${item.name}`}
            detail={detailFor(item.locationId, item.quantity)}
            trailing={
              item.restockAt != null && item.quantity <= item.restockAt ? (
                <Badge label="Low stock" tone="warn" />
              ) : undefined
            }
            onPress={() => router.push(`/item/${item.id}`)}
            accessibilityHint="Opens item details"
          />
        )}
      />

      <View className="absolute bottom-6 left-0 right-0 items-center">
        <Button label="＋ Add item" onPress={() => router.push("/add")} size="lg" />
      </View>
    </View>
  );
}
