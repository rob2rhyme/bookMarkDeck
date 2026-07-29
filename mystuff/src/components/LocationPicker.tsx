import { useMemo } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";

import { locationOptions } from "@/lib/locationTree";
import type { InventoryLocation } from "@/lib/types";
import { Button, Chip } from "@/ui";

/**
 * "Where is it?" — one tap, no dropdowns, no modal.
 *
 * Shared by the add and edit forms so a location is picked the same way
 * everywhere. With no locations saved yet it offers to create some instead of
 * showing an empty control, which is the first-run case.
 */
export function LocationPicker({
  locations,
  value,
  onChange,
  label = "Where is it?",
}: {
  locations: InventoryLocation[];
  value: string | null;
  onChange: (locationId: string | null) => void;
  label?: string;
}) {
  const options = useMemo(() => locationOptions(locations), [locations]);

  return (
    <View className="gap-2">
      <Text className="text-[13px] font-medium text-muted">{label}</Text>

      {options.length === 0 ? (
        <View className="gap-2">
          <Text className="text-[12px] text-faint">
            You haven&apos;t added any places yet — a room, a shelf, a storage
            box. Add some and you&apos;ll be able to find this later.
          </Text>
          <Button
            label="Set up locations"
            variant="secondary"
            onPress={() => router.push("/locations")}
          />
        </View>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-2">
            <Chip
              label="Not set"
              selected={value === null}
              onPress={() => onChange(null)}
            />
            {options.map((o) => (
              <Chip
                key={o.id}
                label={o.label}
                selected={value === o.id}
                onPress={() => onChange(o.id)}
              />
            ))}
          </View>
          <Text className="text-[12px] text-faint">
            Tap a place to say where this lives. You can move it any time.
          </Text>
        </>
      )}
    </View>
  );
}
