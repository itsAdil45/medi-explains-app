import { View } from "react-native";

import DoctorConsultation from "@/components/NewConsultation";
import Nav from "@/components/Nav";

export default function NewConsultation() {
  return (
    <View className="flex-1 bg-white">
      <Nav />
      <DoctorConsultation />
    </View>
  );
}
