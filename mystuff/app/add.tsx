import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { LocationPicker } from "@/components/LocationPicker";
import { useData } from "@/data/provider";
import { newItem } from "@/data/newItem";
import { ITEM_KINDS, type ItemKind } from "@/lib/types";
import { Button, Chip, Field } from "@/ui";

// Progressive disclosure: a name is the only requirement. Kind is one tap and
// shapes the form later; everything else can be filled in whenever. A first
// item should take seconds, not a form-filling session.
export default function AddItemScreen() {
  const { locations, saveItem } = useData();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ItemKind | "">("");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && !saving;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const item = newItem({ name, kind }, new Date().toISOString());
      await saveItem({ ...item, locationId });
      router.back();
    } catch {
      setError("Couldn't save that item. Please try again.");
      setSaving(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-5 p-4">
      <Field
        label="What is it?"
        required
        value={name}
        onChangeText={setName}
        placeholder="e.g. Cordless drill"
        autoFocus
        hint="A name is all you need to start — details can wait."
        returnKeyType="done"
        onSubmitEditing={onSave}
        error={error ?? undefined}
      />

      <View className="gap-2">
        <Text className="text-[13px] font-medium text-muted">Type</Text>
        <View className="flex-row flex-wrap gap-2">
          {ITEM_KINDS.map((k) => (
            <Chip
              key={k.id || "general"}
              label={k.label}
              emoji={k.icon}
              selected={kind === k.id}
              onPress={() => setKind(k.id)}
            />
          ))}
        </View>
        <Text className="text-[12px] text-faint">
          Picking a type means the form asks the right questions later — like
          use-by dates for food, or an author for books.
        </Text>
      </View>

      {/* Only appears once places exist, so a first item is still one field. */}
      {locations.length > 0 ? (
        <LocationPicker
          locations={locations}
          value={locationId}
          onChange={setLocationId}
        />
      ) : null}

      <View className="gap-2">
        <Button
          label="Save item"
          disabled={!canSave}
          loading={saving}
          onPress={onSave}
          fullWidth
          size="lg"
        />
        <Button
          label="Cancel"
          variant="ghost"
          onPress={() => router.back()}
          fullWidth
        />
      </View>
    </ScrollView>
  );
}
