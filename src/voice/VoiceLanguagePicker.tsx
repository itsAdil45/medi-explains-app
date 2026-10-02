import { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, FlatList } from "react-native";
import { Languages, ChevronDown, Check } from "lucide-react-native";

import { api } from "@/api/client";

type Lang = { code: string; name: string; native: string };

// Compact pre-login voice-language switch for the sign-in screens - the
// native counterpart of the website's VoiceLanguageSelect. Kept separate
// from LanguagePicker, which is the full-width consultation-language field
// with its audio/text and evaluation notices.
export default function VoiceLanguagePicker({
  value,
  onChange,
  label,
  tone = "dark",
}: {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  tone?: "dark" | "light";
}) {
  const [langs, setLangs] = useState<Lang[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .languages()
      .then(setLangs)
      .catch(() => setLangs([]));
  }, []);
  if (!langs.length) return null;

  const current = langs.find((l) => l.code === value);
  const color = tone === "light" ? "rgba(255,255,255,0.8)" : "#64748b";

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label || "Language"}: ${current?.native ?? value}`}
        hitSlop={8}
        className={`flex-row items-center gap-1 rounded-md border px-2 py-1 ${
          tone === "light" ? "border-white/30" : "border-slate-200 bg-white"
        }`}
      >
        <Languages size={13} color={color} />
        <Text className={`text-xs ${tone === "light" ? "text-white/80" : "text-slate-700"}`}>
          {current?.native ?? value}
        </Text>
        <ChevronDown size={12} color={color} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
          <Pressable className="max-h-[70%] rounded-t-2xl bg-white pb-6 pt-2">
            <View className="mb-1 items-center py-2">
              <View className="h-1 w-10 rounded-full bg-slate-300" />
            </View>
            {label ? <Text className="px-5 pb-2 text-xs font-semibold text-slate-500">{label}</Text> : null}
            <FlatList
              data={langs}
              keyExtractor={(l) => l.code}
              renderItem={({ item: l }) => (
                <Pressable
                  onPress={() => {
                    onChange(l.code);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: l.code === value }}
                  className="flex-row items-center justify-between px-5 py-3.5"
                >
                  <Text className="text-sm font-medium text-slate-900">
                    {l.native}
                    {l.native !== l.name ? ` — ${l.name}` : ""}
                  </Text>
                  {l.code === value && <Check size={16} color="#4ab96a" />}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
