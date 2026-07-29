import { router } from "expo-router";
import { ScrollView, View } from "react-native";

import { Card, ListRow } from "@/ui";

/** Hub for ledgers, locations, backup, settings, guide and FAQ. */
export default function MoreScreen() {
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 gap-4">
      <Card title="Your things">
        <View>
          <ListRow
            title="Locations"
            detail="Rooms, shelves and boxes"
            onPress={() => router.push("/locations")}
          />
          <ListRow title="On loan" detail="What you've lent out" />
          <ListRow title="Borrowed" detail="What you've borrowed" />
          <ListRow title="Subscriptions" detail="Recurring digital costs" />
        </View>
      </Card>

      <Card title="Your data">
        <View>
          <ListRow title="Backup" detail="Choose where your data is saved" />
          <ListRow title="Export" detail="CSV or JSON — yours to keep" />
          <ListRow title="App lock" detail="Require Face ID or a PIN" />
        </View>
      </Card>

      <Card title="Help">
        <View>
          <ListRow
            title="Guide"
            detail="How My Stuff works"
            onPress={() => router.push("/guide")}
          />
          <ListRow title="FAQ" detail="Common questions" onPress={() => router.push("/faq")} />
        </View>
      </Card>
    </ScrollView>
  );
}
