// Wishlist — wants (and want-to-read) with add, edit-in-place, Got it → item,
// and remove-with-undo. Scan-to-prefill + price comparison arrive in Phase 3.

import { useState } from "react";
import { View } from "react-native";

import { blankItem, makeId } from "@/data/core";
import { useInventory } from "@/data/inventoryStore";
import type { WishlistItem } from "@/lib/types";
import { formatMoney } from "@/lib/value";
import {
  Body,
  Button,
  Card,
  EmptyState,
  Field,
  Screen,
  SectionTitle,
  Title,
} from "@/ui/components";

function num(v: string): number | undefined {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && v.trim() !== "" ? n : undefined;
}

export default function WishlistScreen() {
  const { wishlist, upsertWish, removeWish, upsertItem, hydrated } = useInventory();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");

  const startEdit = (wish: WishlistItem | null) => {
    setEditing(wish ? wish.id : "new");
    setName(wish?.name ?? "");
    setPrice(wish?.estPrice != null ? String(wish.estPrice) : "");
    setNote(wish?.note ?? "");
  };

  const save = () => {
    if (!name.trim()) return;
    const existing = editing !== "new" ? wishlist.find((w) => w.id === editing) : null;
    upsertWish({
      id: existing?.id ?? makeId(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      ...existing,
      name: name.trim(),
      estPrice: num(price),
      note: note.trim() || undefined,
    });
    setEditing(null);
  };

  const gotIt = (wish: WishlistItem) => {
    const item = {
      ...blankItem(new Date().toISOString()),
      name: wish.name,
      price: wish.estPrice,
      category: wish.category,
      barcode: wish.barcode,
      notes: wish.note,
    };
    upsertItem(item);
    removeWish(wish.id);
  };

  return (
    <Screen>
      <Title>Wishlist</Title>
      {editing ? (
        <Card>
          <SectionTitle>{editing === "new" ? "New wish" : "Edit wish"}</SectionTitle>
          <Field label="Name" value={name} onChangeText={setName} autoFocus />
          <Field label="Est. price" keyboardType="numeric" value={price} onChangeText={setPrice} />
          <Field label="Note" value={note} onChangeText={setNote} />
          <Button label="Save" onPress={save} disabled={!name.trim()} />
          <Button label="Cancel" kind="ghost" onPress={() => setEditing(null)} />
        </Card>
      ) : (
        <Button label="♡ Add a wish" onPress={() => startEdit(null)} />
      )}

      {hydrated && wishlist.length === 0 && !editing ? (
        <EmptyState
          icon="♡"
          title="Nothing wished for yet"
          body="Keep wants here — books you want to read included. “Got it” moves a wish into your items."
        />
      ) : (
        wishlist.map((wish) => (
          <Card key={wish.id} onPress={() => startEdit(wish)}>
            <Body bold>{wish.name}</Body>
            <Body muted size={13}>
              {[
                wish.estPrice != null ? formatMoney(wish.estPrice, wish.currency || "USD") : "",
                wish.note ?? "",
              ]
                .filter(Boolean)
                .join(" · ") || "Tap to add details"}
            </Body>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="✓ Got it" kind="ghost" onPress={() => gotIt(wish)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Remove" kind="danger" onPress={() => removeWish(wish.id)} />
              </View>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
