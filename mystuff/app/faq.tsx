import { ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";

import { Card } from "@/ui";

// Answers the questions people actually ask before trusting an app with a
// record of everything they own — privacy and data ownership first.
const FAQ: { q: string; a: string }[] = [
  {
    q: "Do I need an account?",
    a: "No. My Stuff works fully offline on this device. Signing in is optional and only adds syncing between your devices.",
  },
  {
    q: "Where is my data stored?",
    a: "On your device. If you choose to sign in, a copy syncs to your private cloud space that only you can read. Nobody else can see your items.",
  },
  {
    q: "Do my photos get uploaded?",
    a: "Barcode scanning and text recognition run entirely on your device — those images never leave your phone. Item photos you save are stored with your data.",
  },
  {
    q: "Is there a limit on how many items I can add?",
    a: "No. Unlimited items, free, forever. Only features that cost money to run each time you use them — like AI photo recognition — are part of Premium.",
  },
  {
    q: "What happens if I delete the app?",
    a: "Anything stored only on the device goes with it. Make a backup first, or sign in so your data is synced. Restoring never overwrites what's already there.",
  },
  {
    q: "Can I get my data out?",
    a: "Always. Export everything as CSV or JSON whenever you like — no lock-in, no export fee, no request form.",
  },
  {
    q: "Can I change an item after saving it?",
    a: "Yes — open the item and tap Edit. Rename it, change how many you have, or move it somewhere else. Nothing is locked in, and you can leave fields blank if you don't know them yet.",
  },
  {
    q: "What happens to my things if I delete a location?",
    a: "Nothing is lost. Items stored there simply become unassigned, and any sub-locations move up a level — so a shelf inside a deleted room becomes a room of its own rather than disappearing.",
  },
  {
    q: "What is the Attention list?",
    a: "Anything with a date or level that needs you soon: expiring warranties, food past its use-by, upkeep due, subscriptions about to renew, or supplies running low.",
  },
  {
    q: "How does restoring a backup work?",
    a: "It merges by item. Anything missing is added back; anything you already have is left exactly as it is. A restore can never wipe newer changes.",
  },
  {
    q: "Can I lock the app?",
    a: "Yes. Turn on App lock in More to require Face ID, Touch ID or a PIN before your items are shown.",
  },
];

export default function FaqScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "FAQ" }} />
      <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 gap-3">
        {FAQ.map((item) => (
          <Card key={item.q}>
            <View className="gap-1.5">
              <Text className="text-[15px] font-semibold text-ink">{item.q}</Text>
              <Text className="text-[14px] leading-5 text-muted">{item.a}</Text>
            </View>
          </Card>
        ))}
      </ScrollView>
    </>
  );
}
