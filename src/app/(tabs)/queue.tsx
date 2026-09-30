import { View } from "react-native";

import QueueManager from "@/components/QueueManager";
import Nav from "@/components/Nav";

export default function Queue() {
  return (
    <View className="flex-1 bg-white">
      <Nav />
      <QueueManager />
    </View>
  );
}
