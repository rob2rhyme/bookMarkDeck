// Phase-1 insights: live totals, kind split, attention summary — all computed
// by the ported lib. Full charts + AI read arrive in Phase 3.

import { useMemo } from "react";
import { Text, View } from "react-native";

import { useInventory } from "@/data/inventoryStore";
import { subscriptionLedger } from "@/lib/digital";
import { ITEM_KINDS } from "@/lib/types";
import {
  attention,
  attentionCount,
  formatMoney,
  itemCount,
  totalPaid,
  totalValue,
} from "@/lib/value";
import { Body, Card, FactRow, Screen, SectionTitle, Title } from "@/ui/components";
import { useTheme } from "@/ui/theme";
import { radius, spacing } from "@/ui/tokens";

const today = () => new Date().toISOString().slice(0, 10);

function Stat({ label, value }: { label: string; value: string }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 140,
        backgroundColor: palette.bgRaised,
        borderColor: palette.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: spacing.lg,
        marginRight: spacing.sm,
        marginBottom: spacing.sm,
      }}
    >
      <Text style={{ color: palette.textMuted, fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <Text style={{ color: palette.text, fontSize: 20, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}

function KindBar({ label, count, max }: { label: string; count: number; max: number }) {
  const { palette } = useTheme();
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
        <Text style={{ color: palette.textMuted, fontSize: 13 }}>{label}</Text>
        <Text style={{ color: palette.text, fontSize: 13, fontWeight: "600" }}>{count}</Text>
      </View>
      <View style={{ height: 8, backgroundColor: palette.bgElement, borderRadius: 4, overflow: "hidden" }}>
        <View
          style={{
            width: `${max > 0 ? Math.max((count / max) * 100, 3) : 0}%`,
            height: 8,
            backgroundColor: palette.accent,
            borderRadius: 4,
          }}
        />
      </View>
    </View>
  );
}

export default function InsightsScreen() {
  const { items } = useInventory();

  const kindCounts = useMemo(() => {
    const counts = ITEM_KINDS.map((k) => ({
      ...k,
      count: items.filter((i) => (i.kind ?? "") === k.id && !i.archived).length,
    })).filter((k) => k.count > 0);
    return counts.sort((a, b) => b.count - a.count);
  }, [items]);
  const maxKind = kindCounts[0]?.count ?? 0;

  const att = useMemo(() => attention(items, today()), [items]);
  const subs = useMemo(() => subscriptionLedger(items, today()), [items]);

  return (
    <Screen>
      <Title>Insights</Title>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Stat label="Items" value={String(itemCount(items))} />
        <Stat label="Total value (tax incl.)" value={formatMoney(totalValue(items), "USD")} />
        <Stat label="Total paid" value={formatMoney(totalPaid(items), "USD")} />
        {subs.subs.length > 0 ? (
          <Stat label="Subscriptions" value={`≈ ${formatMoney(subs.monthlyTotal, "USD")}/mo`} />
        ) : null}
      </View>

      {kindCounts.length > 0 ? (
        <>
          <SectionTitle>By type</SectionTitle>
          <Card>
            {kindCounts.map((k) => (
              <KindBar key={k.id || "general"} label={`${k.icon} ${k.label}`} count={k.count} max={maxKind} />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Needs attention</SectionTitle>
      <Card>
        {attentionCount(att) === 0 ? (
          <Body muted>All calm — nothing needs you right now.</Body>
        ) : (
          <>
            {att.useByExpired.length > 0 ? <FactRow label="Past use-by" value={String(att.useByExpired.length)} tone="bad" /> : null}
            {att.useBySoon.length > 0 ? <FactRow label="Use by soon" value={String(att.useBySoon.length)} tone="warn" /> : null}
            {att.warrantyExpired.length > 0 ? <FactRow label="Warranty expired" value={String(att.warrantyExpired.length)} tone="bad" /> : null}
            {att.warrantySoon.length > 0 ? <FactRow label="Warranty ending soon" value={String(att.warrantySoon.length)} tone="warn" /> : null}
            {att.renewsSoon.length > 0 ? <FactRow label="Subscription renews soon" value={String(att.renewsSoon.length)} tone="warn" /> : null}
            {att.maintenanceOverdue.length > 0 ? <FactRow label="Upkeep overdue" value={String(att.maintenanceOverdue.length)} tone="bad" /> : null}
            {att.maintenanceSoon.length > 0 ? <FactRow label="Upkeep due soon" value={String(att.maintenanceSoon.length)} tone="warn" /> : null}
            {att.lentOut.length > 0 ? <FactRow label="Lent out" value={String(att.lentOut.length)} /> : null}
            {att.returnOverdue.length > 0 ? <FactRow label="Return overdue" value={String(att.returnOverdue.length)} tone="bad" /> : null}
          </>
        )}
      </Card>

      <Body muted size={13}>
        Charts, trends and the AI read arrive in Phase 3 — the math behind them is already on board.
      </Body>
    </Screen>
  );
}
