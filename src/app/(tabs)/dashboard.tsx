import { View } from "react-native";

import Dashboard from "@/components/Dashboard";
import Nav from "@/components/Nav";

export default function DashboardScreen() {
  return (
    <View className="flex-1 bg-white">
      <Nav />
      <Dashboard />
    </View>
  );
}
