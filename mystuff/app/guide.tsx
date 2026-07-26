import { ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";

import { Card } from "@/ui";

// Written for someone who has never used an inventory app: every entry is a
// task ("How do I…"), in plain language, with no jargon and no unexplained
// icons. Kept short on purpose — a guide nobody finishes helps nobody.
const SECTIONS: { title: string; steps: string[] }[] = [
  {
    title: "Add your first thing",
    steps: [
      "Tap Add and type what it is — a name is all that's required.",
      "Pick a type (Book, Food, Tool…) so the form asks the right questions.",
      "Tap Save. You can fill in price, location and photos any time later.",
    ],
  },
  {
    title: "Scan instead of typing",
    steps: [
      "Tap Scan and point the camera at a barcode or an ISBN on a book.",
      "If the product is recognised the name, brand and image fill themselves in.",
      "Scanning happens on your device — photos are not uploaded to identify them.",
    ],
  },
  {
    title: "Find where something is",
    steps: [
      "Create locations that match real life: Kitchen, Garage, Loft box 2.",
      "Assign an item to a location when you add or edit it.",
      "Use Where is…? and type the name — it tells you the location you set.",
    ],
  },
  {
    title: "Never miss a date",
    steps: [
      "Add a use-by date to food, or a warranty length to electronics.",
      "Items needing action appear under Attention on the Items tab.",
      "Turn on reminders and your phone tells you before a date passes.",
    ],
  },
  {
    title: "Know what it's worth",
    steps: [
      "Enter what you paid; Insights totals it by category and location.",
      "Add store links to compare prices before you re-buy something.",
      "Export an insurance report if you ever need to make a claim.",
    ],
  },
  {
    title: "Keep your data safe",
    steps: [
      "Backup lets you save a copy to your device, iCloud, Drive or Dropbox.",
      "Restoring merges — it adds what's missing and never overwrites your edits.",
      "You can export everything as CSV or JSON at any time. It's your data.",
    ],
  },
];

export default function GuideScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Guide" }} />
      <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 gap-4">
        <Text className="text-[15px] leading-6 text-muted">
          My Stuff is a private catalogue of the things you own — so you can find
          them, remember what they cost, and get told before a warranty or use-by
          date runs out.
        </Text>

        {SECTIONS.map((s) => (
          <Card key={s.title} title={s.title}>
            <View className="gap-2">
              {s.steps.map((step, i) => (
                <View key={step} className="flex-row gap-2.5">
                  <Text className="text-[13px] font-semibold text-accent">{i + 1}.</Text>
                  <Text className="flex-1 text-[14px] leading-5 text-muted">{step}</Text>
                </View>
              ))}
            </View>
          </Card>
        ))}
      </ScrollView>
    </>
  );
}
