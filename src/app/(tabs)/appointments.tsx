import { View } from "react-native";

import Appointments from "@/components/Appointments";
import Nav from "@/components/Nav";

export default function AppointmentsScreen() {
  return (
    <View className="flex-1 bg-white">
      <Nav />
      <Appointments />
    </View>
  );
}
