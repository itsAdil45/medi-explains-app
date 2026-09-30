import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import {
  Building2,
  Check,
  ChevronRight,
  LogOut,
  User,
} from "lucide-react-native";

import { useAuth } from "@/api/auth";
import Nav from "@/components/Nav";

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function Section({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      {title && (
        <Text className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </Text>
      )}
      <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {children}
      </View>
    </View>
  );
}

// Clinics this staff member works at. Picking one scopes the dashboard,
// queue and appointments to it (sent as X-Clinic-Id on every request).
function ClinicSwitcher() {
  const { clinics, activeClinicId, switchClinic } = useAuth();
  const usable = clinics.filter((clinic) => clinic.is_active);

  if (usable.length === 0) return null;

  return (
    <Section title="Working at">
      {usable.map((clinic, i) => {
        const selected = String(clinic.id) === String(activeClinicId);
        return (
          <Pressable
            key={clinic.id}
            disabled={usable.length === 1}
            onPress={() => switchClinic(String(clinic.id))}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-slate-50 ${
              i > 0 ? "border-t border-slate-100" : ""
            } ${selected ? "bg-purple-50" : ""}`}
          >
            <Building2 size={18} color={selected ? "#792884" : "#64748b"} />
            <Text
              className={`flex-1 text-sm ${
                selected ? "font-semibold text-[#792884]" : "text-slate-800"
              }`}
              numberOfLines={1}
            >
              {clinic.name}
            </Text>
            {selected && <Check size={17} color="#792884" strokeWidth={2.5} />}
          </Pressable>
        );
      })}
    </Section>
  );
}

export default function Account() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const isStaff = user.role === "doctor" || user.role === "receptionist";

  function confirmLogout() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          logout();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <View className="flex-1 bg-slate-50">
      <Nav />
      <ScrollView contentContainerClassName="gap-6 px-5 py-6">
        <View className="flex-row items-center gap-3.5">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-[#1e3a5f]">
            <Text className="text-base font-semibold text-white">
              {initials(user.full_name)}
            </Text>
          </View>
          <View className="flex-1">
            <Text
              className="text-lg font-bold text-slate-900"
              numberOfLines={1}
            >
              {user.full_name}
            </Text>
            <Text className="text-xs capitalize text-slate-500">
              {user.role.replaceAll("_", " ")}
              {user.email ? ` · ${user.email}` : ""}
            </Text>
          </View>
        </View>

        <Section>
          <Pressable
            onPress={() => router.push("/profile")}
            className="flex-row items-center gap-3 px-4 py-3.5 active:bg-slate-50"
          >
            <User size={18} color="#64748b" />
            <Text className="flex-1 text-sm font-medium text-slate-800">
              Profile
            </Text>
            <ChevronRight size={18} color="#94a3b8" />
          </Pressable>
        </Section>

        {isStaff && <ClinicSwitcher />}

        <Section>
          <Pressable
            onPress={confirmLogout}
            className="flex-row items-center gap-3 px-4 py-3.5 active:bg-red-50"
          >
            <LogOut size={18} color="#dc2626" />
            <Text className="flex-1 text-sm font-medium text-red-600">
              Sign out
            </Text>
          </Pressable>
        </Section>
      </ScrollView>
    </View>
  );
}
