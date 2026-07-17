// Add / edit an item — one form, reshaped by kind (the ITEM-PROFILES rules):
// books drop warranty+maker, consumables gain use-by, clothing gains size,
// digital gains billing + renewal. Same storage model for every kind.

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { blankItem, locationName } from "@/data/core";
import { useInventory } from "@/data/inventoryStore";
import {
  BILLING_CYCLES,
  CONDITIONS,
  ITEM_KINDS,
  READ_STATUSES,
  type BillingCycle,
  type InventoryItem,
  type ItemCondition,
  type ItemKind,
  type ItemOrigin,
  type ReadStatus,
} from "@/lib/types";
import { shiftYears } from "@/lib/value";
import {
  Body,
  Button,
  Chip,
  ChipRow,
  Field,
  Screen,
  SectionTitle,
} from "@/ui/components";

function num(v: string): number | undefined {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && v.trim() !== "" ? n : undefined;
}

function str(v: string): string | undefined {
  const t = v.trim();
  return t ? t : undefined;
}

export default function ItemFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { items, locations, upsertItem } = useInventory();
  const existing = useMemo(
    () => items.find((i) => i.id === id) ?? null,
    [items, id]
  );

  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<ItemKind | "">(existing?.kind ?? "");
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? 1));
  const [price, setPrice] = useState(existing?.price != null ? String(existing.price) : "");
  const [taxRate, setTaxRate] = useState(existing?.taxRate != null ? String(existing.taxRate) : "");
  const [locationId, setLocationId] = useState<string | null>(existing?.locationId ?? null);
  const [category, setCategory] = useState(existing?.category ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [retailer, setRetailer] = useState(existing?.retailer ?? "");
  const [purchaseDate, setPurchaseDate] = useState(existing?.purchaseDate ?? "");
  const [estValue, setEstValue] = useState(existing?.value != null ? String(existing.value) : "");
  // kind-specific
  const [author, setAuthor] = useState(existing?.author ?? "");
  const [readStatus, setReadStatus] = useState<ReadStatus | undefined>(existing?.readStatus);
  const [useBy, setUseBy] = useState(existing?.useBy ?? "");
  const [openedDate, setOpenedDate] = useState(existing?.openedDate ?? "");
  const [paoMonths, setPaoMonths] = useState(existing?.paoMonths != null ? String(existing.paoMonths) : "");
  const [size, setSize] = useState(existing?.size ?? "");
  const [billingCycle, setBillingCycle] = useState<BillingCycle | undefined>(existing?.billingCycle);
  const [renewsOn, setRenewsOn] = useState(existing?.renewsOn ?? "");
  // general/tool extras
  const [manufacturer, setManufacturer] = useState(existing?.manufacturer ?? "");
  const [model, setModel] = useState(existing?.model ?? "");
  const [serial, setSerial] = useState(existing?.serial ?? "");
  const [condition, setCondition] = useState<ItemCondition | undefined>(existing?.condition);
  const [warrantyCost, setWarrantyCost] = useState(existing?.warrantyCost != null ? String(existing.warrantyCost) : "");
  const [warrantyYears, setWarrantyYears] = useState(existing?.warrantyYears != null ? String(existing.warrantyYears) : "");
  const [warrantyExpiry, setWarrantyExpiry] = useState(existing?.warrantyExpiry ?? "");
  const [maintenanceDate, setMaintenanceDate] = useState(existing?.maintenanceDate ?? "");
  const [origin, setOrigin] = useState<ItemOrigin | undefined>(existing?.origin);
  const [borrowedFrom, setBorrowedFrom] = useState(existing?.borrowedFrom ?? "");
  const [borrowReturnBy, setBorrowReturnBy] = useState(existing?.borrowReturnBy ?? "");
  const [showDetails, setShowDetails] = useState(Boolean(existing));

  const isBook = kind === "book";
  const isConsumable = kind === "food" || kind === "selfcare";
  const isClothing = kind === "clothing";
  const isDigital = kind === "digital";
  const hasWarranty = !isBook && !isConsumable && !isClothing && !isDigital;
  const hasMakerRow = !isBook && !isConsumable && !isDigital;
  const hasCondition = !isConsumable && !isDigital;
  const hasLocation = !isDigital;
  const hasEstValue = !isConsumable && !isDigital;

  const derivedExpiry =
    warrantyExpiry ||
    (purchaseDate && num(warrantyYears)
      ? (shiftYears(purchaseDate, num(warrantyYears)!) ?? "")
      : "");

  const save = () => {
    const base = existing ?? blankItem(new Date().toISOString());
    const item: InventoryItem = {
      ...base,
      name: name.trim() || "Untitled item",
      kind: kind || undefined,
      quantity: num(quantity) ?? 1,
      price: num(price),
      taxRate: num(taxRate),
      locationId: hasLocation ? locationId : null,
      category: str(category),
      notes: str(notes),
      retailer: str(retailer),
      purchaseDate: str(purchaseDate),
      value: hasEstValue ? num(estValue) : undefined,
      author: isBook ? str(author) : undefined,
      readStatus: isBook ? readStatus : undefined,
      useBy: isConsumable ? str(useBy) : undefined,
      openedDate: kind === "selfcare" ? str(openedDate) : undefined,
      paoMonths: kind === "selfcare" ? num(paoMonths) : undefined,
      size: isClothing ? str(size) : undefined,
      billingCycle: isDigital ? (billingCycle ?? "once") : undefined,
      renewsOn:
        isDigital && billingCycle && billingCycle !== "once"
          ? str(renewsOn)
          : undefined,
      manufacturer: hasMakerRow ? str(manufacturer) : undefined,
      model: hasMakerRow ? str(model) : undefined,
      serial: hasMakerRow || isDigital ? str(serial) : undefined,
      condition: hasCondition ? condition : undefined,
      warrantyCost: hasWarranty ? num(warrantyCost) : undefined,
      warrantyYears: hasWarranty ? num(warrantyYears) : undefined,
      warrantyExpiry: hasWarranty ? str(derivedExpiry) : undefined,
      maintenanceDate: hasWarranty ? str(maintenanceDate) : undefined,
      origin: !isDigital ? origin : undefined,
      borrowedFrom: !isDigital && origin ? str(borrowedFrom) : undefined,
      borrowReturnBy: !isDigital && origin ? str(borrowReturnBy) : undefined,
      updatedAt: existing ? new Date().toISOString() : null,
    };
    upsertItem(item);
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? "Edit item" : "Add item" }} />
      <Field label="Name" placeholder="What is it?" value={name} onChangeText={setName} autoFocus={!existing} />
      <SectionTitle>Type</SectionTitle>
      <ChipRow>
        {ITEM_KINDS.map((k) => (
          <Chip
            key={k.id || "general"}
            label={`${k.icon} ${k.label}`}
            active={kind === k.id}
            onPress={() => setKind(k.id)}
          />
        ))}
      </ChipRow>

      {isBook ? (
        <>
          <Field label="Author" value={author} onChangeText={setAuthor} />
          <SectionTitle>Read status</SectionTitle>
          <ChipRow>
            {READ_STATUSES.map((r) => (
              <Chip
                key={r.id}
                label={`${r.icon} ${r.label}`}
                active={readStatus === r.id}
                onPress={() => setReadStatus(readStatus === r.id ? undefined : r.id)}
              />
            ))}
          </ChipRow>
        </>
      ) : null}
      {isConsumable ? (
        <Field label="Use by" hint="YYYY-MM-DD — feeds the Attention panel" placeholder="2027-01-31" value={useBy} onChangeText={setUseBy} />
      ) : null}
      {kind === "selfcare" ? (
        <>
          <Field label="Opened on" hint="YYYY-MM-DD" placeholder="2026-07-01" value={openedDate} onChangeText={setOpenedDate} />
          <Field label="Period after opening (months)" placeholder="12" keyboardType="numeric" value={paoMonths} onChangeText={setPaoMonths} />
        </>
      ) : null}
      {isClothing ? <Field label="Size" placeholder="M · 32×34 · EU 42…" value={size} onChangeText={setSize} /> : null}
      {isDigital ? (
        <>
          <SectionTitle>Billing</SectionTitle>
          <ChipRow>
            {BILLING_CYCLES.map((c) => (
              <Chip key={c.id} label={c.label} active={(billingCycle ?? "once") === c.id} onPress={() => setBillingCycle(c.id)} />
            ))}
          </ChipRow>
          {billingCycle && billingCycle !== "once" ? (
            <Field label="Renews on" hint="YYYY-MM-DD — rolls forward automatically" placeholder="2026-08-01" value={renewsOn} onChangeText={setRenewsOn} />
          ) : (
            <Field label="License key" value={serial} onChangeText={setSerial} />
          )}
        </>
      ) : null}

      <SectionTitle>Cost</SectionTitle>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Price" placeholder="0.00" keyboardType="numeric" value={price} onChangeText={setPrice} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Tax rate %" placeholder="6" keyboardType="numeric" value={taxRate} onChangeText={setTaxRate} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Qty" keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
        </View>
      </View>

      {hasLocation && locations.length > 0 ? (
        <>
          <SectionTitle>Location</SectionTitle>
          <ChipRow>
            <Chip label="None" active={locationId === null} onPress={() => setLocationId(null)} />
            {locations.map((l) => (
              <Chip key={l.id} label={l.name} active={locationId === l.id} onPress={() => setLocationId(l.id)} />
            ))}
          </ChipRow>
        </>
      ) : null}

      {!showDetails ? (
        <Button label="Add details…" kind="ghost" onPress={() => setShowDetails(true)} />
      ) : (
        <>
          {hasMakerRow ? (
            <>
              <SectionTitle>Maker</SectionTitle>
              <Field label="Brand / manufacturer" value={manufacturer} onChangeText={setManufacturer} />
              <Field label="Model" value={model} onChangeText={setModel} />
              {!isClothing ? <Field label="Serial" value={serial} onChangeText={setSerial} /> : null}
            </>
          ) : null}
          {hasCondition ? (
            <>
              <SectionTitle>Condition</SectionTitle>
              <ChipRow>
                {CONDITIONS.map((c) => (
                  <Chip key={c.id} label={c.label} active={condition === c.id} onPress={() => setCondition(condition === c.id ? undefined : c.id)} />
                ))}
              </ChipRow>
            </>
          ) : null}
          {hasWarranty ? (
            <>
              <SectionTitle>Warranty plan</SectionTitle>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Plan cost" placeholder="0.00" keyboardType="numeric" value={warrantyCost} onChangeText={setWarrantyCost} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Years" placeholder="2" keyboardType="numeric" value={warrantyYears} onChangeText={setWarrantyYears} />
                </View>
              </View>
              <Field
                label="Warranty until"
                hint={
                  !warrantyExpiry && derivedExpiry
                    ? `Derived from purchase date + years (${derivedExpiry})`
                    : "YYYY-MM-DD"
                }
                placeholder={derivedExpiry || "2028-07-17"}
                value={warrantyExpiry}
                onChangeText={setWarrantyExpiry}
              />
              <Field label="Next maintenance" hint="YYYY-MM-DD" value={maintenanceDate} onChangeText={setMaintenanceDate} />
            </>
          ) : null}
          {!isDigital ? (
            <>
              <SectionTitle>Whose is it?</SectionTitle>
              <ChipRow>
                <Chip label="Mine" active={!origin} onPress={() => setOrigin(undefined)} />
                <Chip label="🤲 Borrowed" active={origin === "borrowed"} onPress={() => setOrigin("borrowed")} />
                <Chip label="🏷 Rented" active={origin === "rented"} onPress={() => setOrigin("rented")} />
              </ChipRow>
              {origin ? (
                <>
                  <Field label="From" placeholder="Person or store" value={borrowedFrom} onChangeText={setBorrowedFrom} />
                  <Field label="Return by" hint="YYYY-MM-DD" value={borrowReturnBy} onChangeText={setBorrowReturnBy} />
                </>
              ) : null}
            </>
          ) : null}
          <SectionTitle>More</SectionTitle>
          <Field label="Category" placeholder="Electronics, Kitchen…" value={category} onChangeText={setCategory} />
          <Field label={isDigital ? "Platform / account" : "Retailer"} value={retailer} onChangeText={setRetailer} />
          <Field label="Purchase date" hint="YYYY-MM-DD" value={purchaseDate} onChangeText={setPurchaseDate} />
          {hasEstValue ? (
            <Field label="Estimated value (per unit)" keyboardType="numeric" value={estValue} onChangeText={setEstValue} />
          ) : null}
          <Field label="Notes" multiline numberOfLines={3} value={notes} onChangeText={setNotes} style={{ minHeight: 72, textAlignVertical: "top" }} />
        </>
      )}

      <View style={{ height: 8 }} />
      <Button label={existing ? "Save changes" : "Add to Everhold"} onPress={save} disabled={!name.trim()} />
      <Button label="Cancel" kind="ghost" onPress={() => router.back()} />
      {hasLocation && locations.length === 0 ? (
        <Body muted size={13}>
          Tip: seed starter rooms from the Items tab to file things by place.
        </Body>
      ) : null}
    </Screen>
  );
}
