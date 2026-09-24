import { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, FlatList } from "react-native";
import { ChevronDown, Check } from "lucide-react-native";
import { api } from "@/api/client";

type Lang = { code: string; name: string; native: string; has_tts: boolean; rtl?: boolean; quality?: string };

export default function LanguagePicker({
  value,
  onChange,
  disabled,
  includeNotice = true,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  includeNotice?: boolean;
}) {
  const [langs, setLangs] = useState<Lang[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.languages().then(setLangs).catch(() => setLangs([]));
  }, []);

  const current = langs.find((l) => l.code === value);

  return (
    <View>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`flex-row items-center justify-between rounded-lg border border-slate-200 px-3 py-3 ${disabled ? "opacity-50" : ""}`}
      >
        <Text className="text-sm text-slate-900">
          {current
            ? `${current.name} (${current.native}) \u2014 ${current.has_tts ? "audio + text" : "text only"}`
            : "Select language"}
        </Text>
        <ChevronDown size={16} color="#64748b" />
      </Pressable>

      {includeNotice && current && current.quality === "evaluation_pending" && (
        <View className="mt-2 rounded-lg bg-amber-50 px-3 py-2.5">
          <Text className="text-xs text-amber-900">
            <Text className="font-bold">{current.name}: final evaluation pending.</Text> The doctor must
            verify translated medical instructions before release.
          </Text>
        </View>
      )}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
          <Pressable className="max-h-[70%] rounded-t-2xl bg-white pb-6 pt-2">
            <View className="mb-1 items-center py-2">
              <View className="h-1 w-10 rounded-full bg-slate-300" />
            </View>
            <FlatList
              data={langs}
              keyExtractor={(l) => l.code}
              renderItem={({ item: l }) => (
                <Pressable
                  onPress={() => {
                    onChange(l.code);
                    setOpen(false);
                  }}
                  className="flex-row items-center justify-between px-5 py-3.5"
                >
                  <View>
                    <Text className="text-sm font-medium text-slate-900">
                      {l.name} ({l.native})
                    </Text>
                    <Text className="text-xs text-slate-500">{l.has_tts ? "audio + text" : "text only"}</Text>
                  </View>
                  {l.code === value && <Check size={16} color="#4ab96a" />}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function langDirection(langs: Lang[], code: string) {
  const l = langs.find((x) => x.code === code);
  return l?.rtl ? "rtl" : "ltr";
}
