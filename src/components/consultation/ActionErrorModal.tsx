import { Modal, Pressable, Text, View } from "react-native";
import { AlertTriangle, X } from "lucide-react-native";

// The backend reports blocked medication rows by index, e.g.
// "Confirm medication identity/instructions before approval (rows: [0, 1])".
// Show the doctor medicine names instead of array indices.
function describe(message: string, meds: any[]) {
  return message.replace(/\s*\(rows:\s*\[([\d,\s]*)\]\)/, (_match, list) => {
    const names = String(list)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((i) => {
        const m = meds[Number(i)];
        return m?.name || m?.canonical_name || `Medication ${Number(i) + 1}`;
      });
    return names.length ? `\n\nMedications: ${names.join(", ")}` : "";
  });
}

// Why an action on the consultation (approve, release, ...) was refused -
// shown over the page instead of replacing it, so the doctor keeps their
// place and can fix it straight away.
export default function ActionErrorModal({
  message,
  meds = [],
  onClose,
}: {
  message: string | null;
  meds?: any[];
  onClose: () => void;
}) {
  return (
    <Modal
      visible={!!message}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-center bg-black/40 px-6"
        onPress={onClose}
      >
        <Pressable
          className="rounded-2xl bg-white p-5"
          onPress={(event) => event.stopPropagation()}
          accessibilityRole="alert"
        >
          <View className="mb-3 flex-row items-start gap-3">
            <View className="size-10 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle size={20} color="#b45309" />
            </View>
            <View className="flex-1 pt-2">
              <Text className="text-base font-bold text-slate-900">
                Action needed before continuing
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              hitSlop={8}
              className="size-8 items-center justify-center rounded-lg bg-slate-100"
            >
              <X size={16} color="#475569" />
            </Pressable>
          </View>

          {message && (
            <Text className="text-sm leading-5 text-slate-700">
              {describe(message, meds)}
            </Text>
          )}

          <Pressable
            onPress={onClose}
            className="mt-5 items-center rounded-lg bg-[#792884] py-3 active:opacity-80"
          >
            <Text className="text-sm font-semibold text-white">OK</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
