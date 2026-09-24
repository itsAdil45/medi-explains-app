import { View, Text } from "react-native";

export default function SafetyBanner() {
  return (
    <View className="rounded-lg bg-amber-50 px-4 py-3">
      <Text className="text-[13px] leading-5 text-amber-900">
        <Text className="font-bold">Important.</Text> This summary supports your understanding of what your doctor
        said. It does not replace medical advice. Contact your doctor or emergency services if your symptoms get
        worse.
      </Text>
    </View>
  );
}
