import { ScrollView } from "react-native";

import Profile from "@/components/Profile";
import Nav from "@/components/Nav";
export default function profile() {
  return (
    <ScrollView>
      <Nav />
      <Profile />
    </ScrollView>
  );
}
