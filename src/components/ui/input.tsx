import { TextInput, type TextInputProps } from "react-native";

export function Input({
  className = "",
  editable = true,
  ...props
}: TextInputProps & { className?: string }) {
  return (
    <TextInput
      editable={editable}
      placeholderTextColor="#94a3b8"
      className={`h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 ${!editable ? "bg-slate-50 text-slate-500" : "bg-white"} ${className}`}
      {...props}
    />
  );
}
