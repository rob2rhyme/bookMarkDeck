import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";

import { Button, Chip, Field } from "@/ui";

// Progressive disclosure: name + kind + scan is the whole required surface.
// Everything else lives behind "Add details" so a first item takes seconds.
const KINDS = [
  { id: "general", label: "General", emoji: "📦" },
  { id: "book", label: "Book", emoji: "📚" },
  { id: "food", label: "Food", emoji: "🥫" },
  { id: "selfcare", label: "Self-care", emoji: "🧴" },
  { id: "clothing", label: "Clothing", emoji: "👕" },
  { id: "tool", label: "Tool", emoji: "🛠" },
  { id: "digital", label: "Digital", emoji: "💾" },
] as const;

export default function AddItemScreen() {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("general");

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 gap-5">
      <Field
        label="What is it?"
        required
        value={name}
        onChangeText={setName}
        placeholder="e.g. Coffee grinder"
        autoFocus
        hint="A name is all you need to start — you can add details later."
      />

      <View className="gap-2">
        <View className="flex-row flex-wrap gap-2">
          {KINDS.map((k) => (
            <Chip
              key={k.id}
              label={k.label}
              emoji={k.emoji}
              selected={kind === k.id}
              onPress={() => setKind(k.id)}
            />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Button
          label="Save item"
          disabled={!name.trim()}
          onPress={() => router.back()}
          fullWidth
        />
        <Button
          label="Scan a barcode instead"
          variant="ghost"
          onPress={() => {}}
          fullWidth
          accessibilityHint="Opens the camera to scan a product barcode"
        />
      </View>
    </ScrollView>
  );
}
