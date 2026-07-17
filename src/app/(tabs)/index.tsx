import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { useInventory } from "@/data/inventoryStore";
import { locationName } from "@/data/core";
import { ITEM_KINDS, type InventoryItem, type ItemKind } from "@/lib/types";
import { formatMoney, itemValue, paidWithTax } from "@/lib/value";
import {
  Body,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Field,
  Screen,
} from "@/ui/components";
import { useTheme } from "@/ui/theme";
import { spacing } from "@/ui/tokens";

function kindIcon(kind: ItemKind | undefined): string {
  return ITEM_KINDS.find((k) => k.id === (kind ?? ""))?.icon ?? "📦";
}

function costLine(item: InventoryItem): string {
  const paid = paidWithTax(item);
  if (paid > 0) return formatMoney(paid, item.currency || "USD");
  const value = itemValue(item);
  if (value > 0) return formatMoney(value, item.currency || "USD");
  return "";
}

function ItemCard({ item }: { item: InventoryItem }) {
  const router = useRouter();
  const { palette } = useTheme();
  const { locations } = useInventory();
  const cost = costLine(item);
  const where = locationName(locations, item.locationId);
  const returned = item.status === "returned";
  return (
    <Card onPress={() => router.push({ pathname: "/item/[id]", params: { id: item.id } })}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Text style={{ fontSize: 24 }}>{kindIcon(item.kind)}</Text>
        <View style={{ flex: 1 }}>
          <Body bold>{item.name || "Untitled item"}</Body>
          <Text style={{ color: palette.textMuted, fontSize: 13, marginTop: 2 }}>
            {[
              item.quantity > 1 ? `×${item.quantity}` : "",
              where,
              item.origin === "borrowed"
                ? "🤲 Borrowed"
                : item.origin === "rented"
                  ? "🏷 Rented"
                  : "",
              returned ? "🔙 Returned" : "",
            ]
              .filter(Boolean)
              .join(" · ") || "No details yet"}
          </Text>
        </View>
        {cost ? (
          <Text
            style={{
              color: returned ? palette.textFaint : palette.text,
              fontSize: 15,
              fontWeight: "600",
              textDecorationLine: returned ? "line-through" : "none",
            }}
          >
            {cost}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

export default function ItemsScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { items, hydrated, seedStarterRooms, locations } = useInventory();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ItemKind | "" | "all">("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (kindFilter !== "all" && (item.kind ?? "") !== kindFilter) return false;
      if (!q) return true;
      return [item.name, item.category, item.notes, item.manufacturer, item.model]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [items, query, kindFilter]);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1 }}>
        <Field
          label="Search"
          placeholder="Name, brand, notes…"
          value={query}
          onChangeText={setQuery}
        />
        <ChipRow>
          <Chip
            label="All"
            active={kindFilter === "all"}
            onPress={() => setKindFilter("all")}
          />
          {ITEM_KINDS.map((k) => (
            <Chip
              key={k.id || "general"}
              label={`${k.icon} ${k.label}`}
              active={kindFilter === k.id}
              onPress={() => setKindFilter(k.id)}
            />
          ))}
        </ChipRow>
        <View style={{ flex: 1, marginTop: spacing.sm }}>
          {!hydrated ? null : shown.length === 0 && items.length === 0 ? (
            <EmptyState
              icon="📦"
              title="Everhold is ready"
              body="Add your first item — everything stays on this device until you choose to sync."
            >
              {locations.length === 0 ? (
                <Button label="Seed starter rooms" kind="ghost" onPress={seedStarterRooms} />
              ) : null}
              <Button label="+ Add an item" onPress={() => router.push("/item/form")} />
            </EmptyState>
          ) : shown.length === 0 ? (
            <EmptyState icon="🔍" title="No matches" body="Try a different search or filter." />
          ) : (
            <FlatList
              data={shown}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <ItemCard item={item} />}
              contentContainerStyle={{ paddingBottom: 96 }}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
        <Pressable
          onPress={() => router.push("/item/form")}
          style={({ pressed }) => ({
            position: "absolute",
            right: spacing.lg,
            bottom: spacing.lg,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: palette.accent,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
            elevation: 4,
          })}
          accessibilityLabel="Add item"
        >
          <Text style={{ color: palette.onAccent, fontSize: 28, lineHeight: 30 }}>+</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
