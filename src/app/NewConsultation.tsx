import { ScrollView } from "react-native";

import DoctorConsultation from "@/components/NewConsultation";
import Nav from "@/components/Nav";
export default function NewConsultation() {
  return (
    <ScrollView>
      <Nav />
      <DoctorConsultation />
    </ScrollView>
  );
}
