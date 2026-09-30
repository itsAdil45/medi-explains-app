import { Pressable, Text, View } from "react-native";
import { Building2, ChevronLeft, Stethoscope } from "lucide-react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../api/auth";

// App header for signed-in screens. Navigation itself lives in the bottom
// tab bar (see app/(tabs)/_layout.tsx); screens pushed on top of the tabs
// pass `back` to get a back button instead.
export default function Nav({ back = false }: { back?: boolean }) {
  const { user, activeClinic } = useAuth();
  const insets = useSafeAreaInsets();

  if (!user) return null;

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  return (
    <View style={{ paddingTop: insets.top }} className="bg-[#792884]">
      <View className="h-[56px] flex-row items-center justify-between gap-3 px-4">
        <View className="flex-row items-center gap-2">
          {back && (
            <Pressable
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              className="-ml-1 h-9 w-9 items-center justify-center rounded-md active:bg-white/10"
            >
              <ChevronLeft size={24} color="white" />
            </Pressable>
          )}

          <View className="h-7 w-7 items-center justify-center rounded-md bg-[#a8d5ba]">
            <Stethoscope size={15} color="white" strokeWidth={2} />
          </View>

          <Text className="text-[15px] font-semibold tracking-tight text-white">
            AI Healthcare
            <Text className="text-[#a8d5ba]">+</Text>
          </Text>
        </View>

        {activeClinic && (
          <View className="max-w-[45%] flex-row items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5">
            <Building2 size={14} color="#fff" />
            <Text
              className="shrink text-xs font-medium text-white/90"
              numberOfLines={1}
            >
              {activeClinic.name}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
