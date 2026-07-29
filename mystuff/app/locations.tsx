import { useMemo, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import * as Crypto from "expo-crypto";

import { useData } from "@/data/provider";
import {
  childrenOf,
  locationOptions,
  wouldCreateCycle,
} from "@/lib/locationTree";
import type { InventoryLocation } from "@/lib/types";
import { Button, Card, Chip, EmptyState, Field, ListRow } from "@/ui";

export default function LocationsScreen() {
  const { locations, items, saveLocation, removeLocation } = useData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const editing = editingId
    ? locations.find((l) => l.id === editingId) ?? null
    : null;

  // A location can't move inside itself or its own descendants — that branch
  // would become unreachable forever, so those options simply aren't offered.
  const parentChoices = useMemo(
    () =>
      locationOptions(locations).filter(
        (o) => !editingId || !wouldCreateCycle(locations, editingId, o.id)
      ),
    [locations, editingId]
  );

  // Depth-first so the list reads as a tree, with indentation by depth.
  const ordered = useMemo(() => {
    const out: { loc: InventoryLocation; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const loc of childrenOf(locations, parent)) {
        out.push({ loc, depth });
        walk(loc.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [locations]);

  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of items) {
      if (i.locationId) counts[i.locationId] = (counts[i.locationId] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const reset = () => {
    setEditingId(null);
    setName("");
    setParentId(null);
  };

  const startEdit = (loc: InventoryLocation) => {
    setEditingId(loc.id);
    setName(loc.name);
    setParentId(loc.parentId);
  };

  const onSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await saveLocation(
        editing
          ? { ...editing, name: trimmed, parentId, updatedAt: now }
          : {
              id: Crypto.randomUUID(),
              name: trimmed,
              parentId,
              createdAt: now,
              updatedAt: now,
            }
      );
      reset();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (loc: InventoryLocation) => {
    const held = itemCounts[loc.id] ?? 0;
    const kids = childrenOf(locations, loc.id).length;
    const consequences = [
      held ? `${held} item${held === 1 ? "" : "s"} will become unassigned` : null,
      kids ? `${kids} sub-location${kids === 1 ? "" : "s"} will move up a level` : null,
    ].filter(Boolean);

    Alert.alert(
      `Delete "${loc.name}"?`,
      consequences.length
        ? `${consequences.join(", and ")}. Nothing is deleted except the location itself.`
        : "Nothing is stored here.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (editingId === loc.id) reset();
            void removeLocation(loc.id);
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Locations" }} />
      <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-4 p-4">
        <Card
          title={editing ? "Rename or move" : "Add a location"}
          subtitle={
            editing
              ? "Items stay where they are — only the place changes."
              : "Rooms, shelves, boxes — match real life."
          }
        >
          <View className="gap-3">
            <Field
              label="Name"
              required
              value={name}
              onChangeText={setName}
              placeholder="e.g. Kitchen, Loft box 2"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
            />

            {parentChoices.length > 0 ? (
              <View className="gap-2">
                <Text className="text-[13px] font-medium text-muted">Inside</Text>
                <View className="flex-row flex-wrap gap-2">
                  <Chip
                    label="Nowhere (top level)"
                    selected={parentId === null}
                    onPress={() => setParentId(null)}
                  />
                  {parentChoices.map((o) => (
                    <Chip
                      key={o.id}
                      label={o.label}
                      selected={parentId === o.id}
                      onPress={() => setParentId(o.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <Button
              label={editing ? "Save changes" : "Add location"}
              onPress={onSubmit}
              disabled={!name.trim() || busy}
              fullWidth
            />
            {editing ? (
              <Button label="Cancel" variant="ghost" onPress={reset} fullWidth />
            ) : null}
          </View>
        </Card>

        {ordered.length === 0 ? (
          <EmptyState
            emoji="🏠"
            title="No locations yet"
            body="Add the places your things live — a room, a shelf, a storage box. Then you can say where each item is, and find it later."
          />
        ) : (
          <Card title="Your locations" subtitle="Tap one to rename or move it.">
            <View>
              {ordered.map(({ loc, depth }) => {
                const held = itemCounts[loc.id] ?? 0;
                return (
                  <View key={loc.id} style={{ paddingLeft: depth * 16 }}>
                    <ListRow
                      title={loc.name}
                      detail={held ? `${held} item${held === 1 ? "" : "s"}` : "Empty"}
                      onPress={() => startEdit(loc)}
                      accessibilityHint="Opens this location for renaming or moving"
                      trailing={
                        <Text
                          onPress={() => onDelete(loc)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${loc.name}`}
                          className="px-2 py-1 text-[13px] text-bad"
                        >
                          Delete
                        </Text>
                      }
                    />
                  </View>
                );
              })}
            </View>
          </Card>
        )}
      </ScrollView>
    </>
  );
}
