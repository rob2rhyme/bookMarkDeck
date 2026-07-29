import { useEffect, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";

import { LocationPicker } from "@/components/LocationPicker";
import { useData } from "@/data/provider";
import {
  applyDraft,
  draftErrors,
  isDirty,
  itemToDraft,
  type ItemDraft,
} from "@/lib/itemEdit";
import { ITEM_KINDS } from "@/lib/types";
import { Button, Chip, EmptyState, Field } from "@/ui";

export default function EditItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, locations, loading, saveItem } = useData();
  const item = items.find((i) => i.id === id);

  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seeded once the item arrives, then left alone — re-seeding on every store
  // refresh would throw away whatever the user is part-way through typing.
  useEffect(() => {
    if (item && !draft) setDraft(itemToDraft(item));
  }, [item, draft]);

  if (!item || !draft) {
    return (
      <>
        <Stack.Screen options={{ title: "Edit" }} />
        <View className="flex-1 justify-center bg-canvas">
          {loading ? null : (
            <EmptyState
              emoji="🤷"
              title="Item not found"
              body="It may have been deleted. Head back to your list."
              actionLabel="Back to items"
              onAction={() => router.back()}
            />
          )}
        </View>
      </>
    );
  }

  const errors = draftErrors(draft);
  const dirty = isDirty(item, draft);
  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const onSave = async () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    if (!dirty) {
      router.back();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await saveItem(
        applyDraft(item, draft, {
          now: new Date().toISOString(),
          eventId: Crypto.randomUUID(),
          locations,
        })
      );
      router.back();
    } catch {
      setSaveError("Couldn't save your changes. Please try again.");
      setSaving(false);
    }
  };

  // Leaving with unsaved edits is the one place this screen can lose work,
  // so it asks — the same forgiveness rule as delete.
  const onCancel = () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert("Discard your changes?", "Your edits won't be saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: `Edit ${item.name}` }} />
      <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-5 p-4">
        <Field
          label="Name"
          required
          value={draft.name}
          onChangeText={(v) => set("name", v)}
          placeholder="e.g. Cordless drill"
          error={showErrors ? errors.name : undefined}
        />

        <View className="gap-2">
          <Text className="text-[13px] font-medium text-muted">Type</Text>
          <View className="flex-row flex-wrap gap-2">
            {ITEM_KINDS.map((k) => (
              <Chip
                key={k.id || "general"}
                label={k.label}
                emoji={k.icon}
                selected={draft.kind === k.id}
                onPress={() => set("kind", k.id)}
              />
            ))}
          </View>
        </View>

        <LocationPicker
          locations={locations}
          value={draft.locationId}
          onChange={(v) => set("locationId", v)}
        />

        <Field
          label="How many?"
          value={draft.quantity}
          onChangeText={(v) => set("quantity", v)}
          keyboardType="number-pad"
          placeholder="1"
          error={showErrors ? errors.quantity : undefined}
        />

        <Field
          label="Category"
          value={draft.category}
          onChangeText={(v) => set("category", v)}
          placeholder="e.g. Power tools"
          hint="Optional — your own grouping, however you think about it."
        />

        <Field
          label="Notes"
          value={draft.notes}
          onChangeText={(v) => set("notes", v)}
          placeholder="Anything worth remembering"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {saveError ? (
          <Text className="text-[13px] text-bad">{saveError}</Text>
        ) : null}

        <View className="gap-2">
          <Button
            label="Save changes"
            onPress={onSave}
            loading={saving}
            disabled={saving}
            fullWidth
            size="lg"
          />
          <Button label="Cancel" variant="ghost" onPress={onCancel} fullWidth />
        </View>
      </ScrollView>
    </>
  );
}
