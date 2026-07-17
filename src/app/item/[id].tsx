// Item detail — kind-aware fact rows, tax-true price breakdown, one-tap
// status + read-status, delete with undo. Edit opens the shared form modal.

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";

import { locationName } from "@/data/core";
import { useInventory } from "@/data/inventoryStore";
import {
  ITEM_KINDS,
  ITEM_STATUSES,
  READ_STATUSES,
  type InventoryItem,
} from "@/lib/types";
import {
  daysUntil,
  effectiveUseBy,
  formatMoney,
  monthlyEquivalent,
  nextRenewal,
  paidWithTax,
  taxAmount,
} from "@/lib/value";
import {
  Body,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  FactRow,
  Screen,
  SectionTitle,
  Title,
} from "@/ui/components";

const today = () => new Date().toISOString().slice(0, 10);

function useByTone(day: string | null): "bad" | "warn" | undefined {
  if (!day) return undefined;
  const d = daysUntil(day, today());
  if (d === null) return undefined;
  if (d < 0) return "bad";
  if (d <= 14) return "warn";
  return undefined;
}

function money(item: InventoryItem, n: number): string {
  return formatMoney(n, item.currency || "USD");
}

export default function ItemDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, locations, upsertItem, removeItem } = useInventory();
  const item = useMemo(() => items.find((i) => i.id === id) ?? null, [items, id]);

  if (!item) {
    return (
      <Screen>
        <EmptyState icon="🫥" title="Not here" body="This item was deleted or never existed." />
      </Screen>
    );
  }

  const kindMeta = ITEM_KINDS.find((k) => k.id === (item.kind ?? ""));
  const paid = paidWithTax(item);
  const subtotal = (item.price ?? 0) * (item.quantity || 1);
  const tax = taxAmount(item);
  const useByDay = effectiveUseBy(item);
  const renews = nextRenewal(item, today());
  const renewDays = renews ? daysUntil(renews, today()) : null;
  const perMonth = monthlyEquivalent(item);
  const where = locationName(locations, item.locationId);

  const setStatus = (status: InventoryItem["status"]) => {
    upsertItem({
      ...item,
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: item.name || "Item" }} />
      <Title>
        {kindMeta?.icon ?? "📦"} {item.name}
      </Title>

      <Card>
        {item.kind === "book" && item.author ? <FactRow label="Author" value={item.author} /> : null}
        {where ? <FactRow label="Location" value={where} /> : null}
        {item.quantity > 1 ? <FactRow label="Quantity" value={`×${item.quantity}`} /> : null}
        {item.category ? <FactRow label="Category" value={item.category} /> : null}
        {item.manufacturer || item.model ? (
          <FactRow label="Maker" value={[item.manufacturer, item.model].filter(Boolean).join(" ")} />
        ) : null}
        {item.serial ? (
          <FactRow label={item.kind === "digital" ? "License key" : "Serial"} value={item.serial} />
        ) : null}
        {item.size ? <FactRow label="Size" value={item.size} /> : null}
        {useByDay ? <FactRow label="Use by" value={useByDay} tone={useByTone(useByDay)} /> : null}
        {item.kind === "selfcare" && item.openedDate ? (
          <FactRow label="Opened" value={item.openedDate + (item.paoMonths ? ` · PAO ${item.paoMonths}mo` : "")} />
        ) : null}
        {item.billingCycle && item.billingCycle !== "once" ? (
          <FactRow
            label="Billing"
            value={`${item.billingCycle === "monthly" ? "Monthly" : "Yearly"}${perMonth > 0 ? ` · ≈ ${money(item, perMonth)}/mo` : ""}`}
          />
        ) : null}
        {renews ? (
          <FactRow
            label="Renews"
            value={renews}
            tone={renewDays !== null && renewDays <= 7 ? "warn" : undefined}
          />
        ) : null}
        {item.warrantyExpiry ? (
          <FactRow
            label="Warranty until"
            value={item.warrantyExpiry}
            tone={(daysUntil(item.warrantyExpiry, today()) ?? 99) < 0 ? "bad" : (daysUntil(item.warrantyExpiry, today()) ?? 99) <= 30 ? "warn" : "good"}
          />
        ) : null}
        {item.maintenanceDate ? <FactRow label="Next upkeep" value={item.maintenanceDate} /> : null}
        {item.origin ? (
          <FactRow
            label={item.origin === "borrowed" ? "🤲 Borrowed from" : "🏷 Rented from"}
            value={[item.borrowedFrom, item.borrowReturnBy ? `back by ${item.borrowReturnBy}` : ""]
              .filter(Boolean)
              .join(" · ") || "—"}
          />
        ) : null}
        {item.condition ? <FactRow label="Condition" value={item.condition} /> : null}
        {item.retailer ? (
          <FactRow label={item.kind === "digital" ? "Platform" : "Retailer"} value={item.retailer} />
        ) : null}
        {item.purchaseDate ? <FactRow label="Purchased" value={item.purchaseDate} /> : null}
      </Card>

      {paid > 0 ? (
        <Card>
          <FactRow label="Subtotal" value={money(item, subtotal)} />
          {item.warrantyCost ? <FactRow label="Warranty plan" value={money(item, item.warrantyCost)} /> : null}
          {tax > 0 ? <FactRow label="Tax" value={money(item, tax)} /> : null}
          <FactRow label={item.status === "returned" ? "Paid (returned — not in totals)" : "Paid"} value={money(item, paid)} />
        </Card>
      ) : null}

      {item.kind === "book" ? (
        <>
          <SectionTitle>Read status</SectionTitle>
          <ChipRow>
            {READ_STATUSES.map((r) => (
              <Chip
                key={r.id}
                label={`${r.icon} ${r.label}`}
                active={item.readStatus === r.id}
                onPress={() =>
                  upsertItem({
                    ...item,
                    readStatus: item.readStatus === r.id ? undefined : r.id,
                    updatedAt: new Date().toISOString(),
                  })
                }
              />
            ))}
          </ChipRow>
        </>
      ) : null}

      <SectionTitle>Status</SectionTitle>
      <ChipRow>
        {ITEM_STATUSES.filter((s) => s.id !== "lent").map((s) => (
          <Chip
            key={s.id}
            label={`${s.icon} ${s.label}`}
            active={(item.status ?? "have") === s.id}
            onPress={() => setStatus(s.id === "have" ? undefined : s.id)}
          />
        ))}
      </ChipRow>

      {item.notes ? (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Card>
            <Body>{item.notes}</Body>
          </Card>
        </>
      ) : null}

      <SectionTitle>Actions</SectionTitle>
      <Button
        label="Edit"
        onPress={() => router.push({ pathname: "/item/form", params: { id: item.id } })}
      />
      <Button
        label="Delete"
        kind="danger"
        onPress={() => {
          removeItem(item.id);
          router.back();
        }}
      />
    </Screen>
  );
}
