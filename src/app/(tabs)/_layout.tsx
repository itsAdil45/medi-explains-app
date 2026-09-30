import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";

import { useAuth } from "@/api/auth";
import { visibleTabs } from "@/lib/navigation";

const ACCENT = "#792884";

// Signed-in area: one bottom tab per section the role can use (replaces the
// old header hamburger menu). Tabs a role can't use are hidden rather than
// removed, since the set of screens in the navigator is static.
export default function TabLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) return <Redirect href="/" />;

  const tabs = visibleTabs(user.role);

  return (
    <NativeTabs
      backgroundColor="white"
      indicatorColor="#f3e8f5"
      iconColor={{ default: "#64748b", selected: ACCENT }}
      labelStyle={{
        default: { color: "#64748b" },
        selected: { color: ACCENT },
      }}
    >
      <NativeTabs.Trigger name="dashboard" hidden={!tabs.has("dashboard")}>
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
          md="dashboard"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="NewConsultation"
        hidden={!tabs.has("NewConsultation")}
      >
        <NativeTabs.Trigger.Label>New</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "plus.circle", selected: "plus.circle.fill" }}
          md="add_circle"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="queue" hidden={!tabs.has("queue")}>
        <NativeTabs.Trigger.Label>Queue</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "list.number", selected: "list.number" }}
          md="format_list_numbered"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="appointments"
        hidden={!tabs.has("appointments")}
      >
        <NativeTabs.Trigger.Label>Appointments</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "calendar", selected: "calendar" }}
          md="calendar_month"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.circle", selected: "person.circle.fill" }}
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
