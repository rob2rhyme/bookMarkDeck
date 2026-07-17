// More — appearance (the theme toggle), your data at a glance, locations,
// and what's coming. Backup destinations and sync land in Phase 4.

import { useState } from "react";
import { View } from "react-native";

import { useInventory } from "@/data/inventoryStore";
import {
  Body,
  Button,
  Card,
  Chip,
  ChipRow,
  FactRow,
  Field,
  Screen,
  SectionTitle,
  Title,
} from "@/ui/components";
import { useTheme, type ThemeMode } from "@/ui/theme";

const MODES: { id: ThemeMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "dark", label: "🌙 Dark" },
  { id: "light", label: "☀️ Light" },
];

export default function MoreScreen() {
  const { mode, setMode } = useTheme();
  const { items, wishlist, locations, addLocation, seedStarterRooms } = useInventory();
  const [newRoom, setNewRoom] = useState("");

  return (
    <Screen>
      <Title>More</Title>

      <SectionTitle>Appearance</SectionTitle>
      <ChipRow>
        {MODES.map((m) => (
          <Chip key={m.id} label={m.label} active={mode === m.id} onPress={() => setMode(m.id)} />
        ))}
      </ChipRow>

      <SectionTitle>Locations</SectionTitle>
      <Card>
        {locations.length === 0 ? (
          <Body muted>No rooms yet.</Body>
        ) : (
          <Body muted size={13}>
            {locations.map((l) => l.name).join(" · ")}
          </Body>
        )}
        <View style={{ height: 10 }} />
        <Field
          label="Add a room or place"
          placeholder="Attic, Car, Office…"
          value={newRoom}
          onChangeText={setNewRoom}
          onSubmitEditing={() => {
            if (newRoom.trim()) {
              addLocation(newRoom);
              setNewRoom("");
            }
          }}
          returnKeyType="done"
        />
        <Button
          label="Add place"
          kind="ghost"
          disabled={!newRoom.trim()}
          onPress={() => {
            addLocation(newRoom);
            setNewRoom("");
          }}
        />
        {locations.length === 0 ? (
          <Button label="Seed starter rooms" kind="ghost" onPress={seedStarterRooms} />
        ) : null}
      </Card>

      <SectionTitle>Your data</SectionTitle>
      <Card>
        <FactRow label="Items" value={String(items.length)} />
        <FactRow label="Wishes" value={String(wishlist.length)} />
        <FactRow label="Places" value={String(locations.length)} />
        <FactRow label="Where it lives" value="On this device" />
      </Card>

      <SectionTitle>Coming next</SectionTitle>
      <Card>
        <Body muted size={13}>
          Phase 2 — barcode scanning, photos, QR location labels.{"\n"}
          Phase 3 — price comparison, ledgers, full insights charts.{"\n"}
          Phase 4 — sign-in sync and backup to iCloud / Drive / Dropbox / this device.
        </Body>
      </Card>

      <Body muted size={13}>
        Everhold · Phase 1 · local-first, private by default. Nothing leaves this device.
      </Body>
    </Screen>
  );
}
