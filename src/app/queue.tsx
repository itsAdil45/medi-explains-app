import { ScrollView } from "react-native";

import QueueManager from "@/components/QueueManager";
import Nav from "@/components/Nav";
export default function Queue() {
  return (
    <ScrollView>
      <Nav />
      <QueueManager />
    </ScrollView>
  );
}
