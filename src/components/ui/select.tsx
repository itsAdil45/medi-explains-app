import { useState } from "react";
import { View, Text, Pressable, ScrollView, Modal } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";

export type SelectOption = { id: string | number; label: string };

// Native stand-in for the website's <select>: a field that opens a modal
// list of options.
export function SelectField({
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled = false,
  className = "mb-4",
}: {
  label?: string;
  value: string;
  placeholder: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => String(option.id) === value);

  return (
    <View className={className}>
      {label && (
        <Text className="mb-1.5 text-sm font-medium text-slate-700">
          {label}
        </Text>
      )}

      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`min-h-11 flex-row items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <Text
          className={`flex-1 text-sm ${
            selected ? "text-slate-900" : "text-slate-400"
          }`}
          numberOfLines={1}
        >
          {selected?.label || placeholder}
        </Text>
        <ChevronDown size={16} color="#64748b" />
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
            className="max-h-[70%] rounded-2xl bg-white p-4"
            onPress={(event) => event.stopPropagation()}
          >
            <Text className="mb-3 text-base font-semibold text-slate-900">
              {label || placeholder}
            </Text>

            <ScrollView>
              {options.map((option) => {
                const selectedOption = String(option.id) === value;

                return (
                  <Pressable
                    key={String(option.id)}
                    onPress={() => {
                      onChange(String(option.id));
                      setOpen(false);
                    }}
                    className={`flex-row items-center rounded-lg px-3 py-3 ${
                      selectedOption ? "bg-purple-50" : "active:bg-slate-50"
                    }`}
                  >
                    <Text
                      className={`flex-1 text-sm ${
                        selectedOption
                          ? "font-semibold text-[#792884]"
                          : "text-slate-800"
                      }`}
                    >
                      {option.label}
                    </Text>

                    {selectedOption && <Check size={17} color="#792884" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
