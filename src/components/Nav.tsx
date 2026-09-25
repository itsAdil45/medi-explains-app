import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stethoscope, Menu, X, User, LogOut } from "lucide-react-native";
import { useAuth } from "../api/auth";
import { router } from "expo-router";

function initials(name?: string) {
  if (!name) return "?";

  const parts = name.trim().split(/\s+/);

  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "")
    ? (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase()
    : "?";
}

export default function Nav() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  return (
    <View className="relative z-50 pt-10">
      {/* Top Navigation */}
      <View className="h-[60px] flex-row items-center justify-between bg-[#792884] px-5">
        {/* Logo */}
        <View className="flex-row items-center gap-2.5">
          <View className="h-7 w-7 items-center justify-center rounded-md bg-[#a8d5ba]">
            <Stethoscope size={15} color="white" strokeWidth={2} />
          </View>

          <Text className="text-[15px] font-semibold tracking-tight text-white">
            AI Healthcare
            <Text className="text-[#a8d5ba]">+</Text>
          </Text>
        </View>

        {/* Dashboard + Hamburger */}
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.replace("/")}
            className=" items-center justify-center rounded-md active:bg-white/10"
          >
            <Text className="text-[14px] font-medium text-white">
              Dashboard
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMenuOpen((prev) => !prev)}
            className="h-10 w-10 items-center justify-center rounded-md active:bg-white/10"
          >
            {menuOpen ? (
              <X size={23} color="white" />
            ) : (
              <Menu size={23} color="white" />
            )}
          </Pressable>
        </View>
      </View>

      {/* Dropdown Menu */}
      {menuOpen && (
        <View className="absolute right-4 top-[65px] w-60 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          {/* Profile */}
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              router.replace("/profile");
              // Navigate to profile here
            }}
            className="flex-row items-center gap-3 rounded-lg px-3 py-3 active:bg-gray-100"
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-[#1e3a5f]">
              <Text className="text-xs font-semibold text-white">
                {initials(user.full_name)}
              </Text>
            </View>

            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900">
                {user.full_name}
              </Text>

              <Text className="text-xs capitalize text-gray-500">
                {user.role.replace("_", " ")}
              </Text>
            </View>

            <User size={18} color="#6b7280" />
          </Pressable>

          <View className="my-1 h-px bg-gray-100" />

          {/* Logout */}
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              logout();
            }}
            className="flex-row items-center gap-3 rounded-lg px-3 py-3 active:bg-red-50"
          >
            <LogOut size={19} color="#dc2626" />

            <Text className="text-sm font-medium text-red-600">Sign out</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
