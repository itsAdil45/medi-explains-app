import { useState } from "react";
import { Pressable, Text, View, Modal, FlatList } from "react-native";
import {
  Stethoscope,
  Menu,
  X,
  User,
  LogOut,
  Building2,
  ChevronDown,
  Check,
  LayoutDashboard,
  Plus,
  ClipboardCheck,
  List,
  CalendarDays,
} from "lucide-react-native";
import { router } from "expo-router";

import { useAuth } from "../api/auth";

function initials(name?: string) {
  if (!name) return "?";

  const parts = name.trim().split(/\s+/);

  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function MenuItem({
  icon: Icon,
  label,
  onPress,
  danger = false,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-lg px-3 py-3 active:bg-slate-100 ${
        danger ? "active:bg-red-50" : ""
      }`}
    >
      <Icon size={18} color={danger ? "#dc2626" : "#64748b"} />

      <Text
        className={`flex-1 text-sm font-medium ${
          danger ? "text-red-600" : "text-slate-800"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ClinicSwitcher() {
  const { clinics = [], activeClinicId, switchClinic } = useAuth();

  const [open, setOpen] = useState(false);

  const usable = clinics.filter((clinic: any) => clinic.is_active);

  if (usable.length === 0) {
    return null;
  }

  if (usable.length === 1) {
    return (
      <View className="flex-row items-center gap-2 rounded-lg bg-white/10 px-3 py-2">
        <Building2 size={16} color="#fff" />

        <Text
          className="max-w-[190px] text-xs font-medium text-white/90"
          numberOfLines={1}
        >
          {usable[0].name}
        </Text>
      </View>
    );
  }

  const activeClinic = usable.find(
    (clinic: any) => String(clinic.id) === String(activeClinicId),
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-2 rounded-lg bg-white/10 px-3 py-2 active:bg-white/20"
      >
        <Building2 size={16} color="#fff" />

        <Text
          className="max-w-[150px] text-xs font-medium text-white/90"
          numberOfLines={1}
        >
          {activeClinic?.name || "Select clinic"}
        </Text>

        <ChevronDown size={14} color="#fff" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          className="flex-1 justify-center bg-black/40 px-6"
          onPress={() => setOpen(false)}
        >
          <Pressable
            className="rounded-2xl bg-white p-4"
            onPress={(event) => event.stopPropagation()}
          >
            <Text className="mb-3 text-base font-semibold text-slate-900">
              Working at clinic
            </Text>

            {usable.map((clinic: any) => {
              const selected = String(clinic.id) === String(activeClinicId);

              return (
                <Pressable
                  key={clinic.id}
                  onPress={() => {
                    switchClinic(String(clinic.id));
                    setOpen(false);
                  }}
                  className={`flex-row items-center rounded-lg px-3 py-3 ${
                    selected ? "bg-purple-50" : "active:bg-slate-50"
                  }`}
                >
                  <View className="flex-1">
                    <Text
                      className={`text-sm ${
                        selected
                          ? "font-semibold text-[#792884]"
                          : "text-slate-900"
                      }`}
                    >
                      {clinic.name}
                    </Text>
                  </View>

                  {selected && (
                    <Check size={17} color="#792884" strokeWidth={2.5} />
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function Nav() {
  const { user, logout } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  /*
   * Same role rules as the web Nav.
   */
  const canCreate = user.role === "doctor";

  const canManageQueue = ["receptionist", "doctor"].includes(user.role);

  const canSeeAppointments = ["patient", "receptionist", "doctor"].includes(
    user.role,
  );

  const isDoctor = user.role === "doctor";

  function closeMenu() {
    setMenuOpen(false);
  }

  function navigate(path: string) {
    closeMenu();
    router.replace(path as any);
  }

  function handleLogout() {
    closeMenu();
    logout();
    router.replace("/login");
  }

  return (
    <View className="relative z-50 pt-10">
      {/* TOP NAVIGATION */}
      <View className="h-[60px] flex-row items-center justify-between bg-[#792884] px-5">
        {/* Logo */}
        <Pressable
          onPress={() => router.replace("/")}
          className="flex-row items-center gap-2.5"
        >
          <View className="h-7 w-7 items-center justify-center rounded-md bg-[#a8d5ba]">
            <Stethoscope size={15} color="white" strokeWidth={2} />
          </View>

          <Text className="text-[15px] font-semibold tracking-tight text-white">
            AI Healthcare
            <Text className="text-[#a8d5ba]">+</Text>
          </Text>
        </Pressable>

        {/* Dashboard + Hamburger */}
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.replace("/")}
            className="items-center justify-center rounded-md px-1 py-2 active:bg-white/10"
          >
            <Text className="text-[14px] font-medium text-white">
              Dashboard
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMenuOpen((current) => !current)}
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

      {/* MENU */}
      {menuOpen && (
        <View className="absolute right-4 top-[65px] w-[280px] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {/* PROFILE HEADER */}
          <Pressable
            onPress={() => navigate("/profile")}
            className="flex-row items-center gap-3 rounded-lg px-3 py-3 active:bg-slate-100"
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-[#1e3a5f]">
              <Text className="text-xs font-semibold text-white">
                {initials(user.full_name)}
              </Text>
            </View>

            <View className="flex-1">
              <Text
                className="text-sm font-semibold text-slate-900"
                numberOfLines={1}
              >
                {user.full_name}
              </Text>

              <Text className="text-xs capitalize text-slate-500">
                {user.role.replace("_", " ")}
              </Text>
            </View>

            <User size={18} color="#64748b" />
          </Pressable>

          <View className="my-1 h-px bg-slate-100" />

          {/* CLINIC */}
          {isDoctor && (
            <>
              <View className="px-3 py-2">
                <Text className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Working at
                </Text>

                <ClinicSwitcher />
              </View>

              <View className="my-1 h-px bg-slate-100" />
            </>
          )}

          {/* DOCTOR NAVIGATION */}

          <MenuItem
            icon={LayoutDashboard}
            label="Dashboard"
            onPress={() => navigate("/")}
          />

          {canCreate && (
            <MenuItem
              icon={Plus}
              label="New consultation"
              onPress={() => navigate("/NewConsultation")}
            />
          )}

          {canManageQueue && (
            <MenuItem
              icon={List}
              label="Queue"
              onPress={() => navigate("/queue")}
            />
          )}

          {canSeeAppointments && (
            <MenuItem
              icon={CalendarDays}
              label="Appointments"
              onPress={() => navigate("/appointments")}
            />
          )}

          <View className="my-1 h-px bg-slate-100" />

          {/* LOGOUT */}
          <MenuItem
            icon={LogOut}
            label="Sign out"
            danger
            onPress={handleLogout}
          />
        </View>
      )}
    </View>
  );
}
