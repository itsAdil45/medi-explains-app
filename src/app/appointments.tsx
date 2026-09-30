import { ScrollView } from "react-native";

import Appointments from "@/components/Appointments";
import Nav from "@/components/Nav";
export default function Queue() {
  return (
    <ScrollView>
      <Nav />
      <Appointments />
    </ScrollView>
  );
}
