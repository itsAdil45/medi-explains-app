import { Pressable, Text, ActivityIndicator, type PressableProps } from "react-native";

type Variant = "default" | "secondary" | "danger";
type Size = "default" | "sm";

const VARIANT_STYLES: Record<Variant, { bg: string; text: string }> = {
  default: { bg: "bg-[#4ab96a]", text: "text-white" },
  secondary: { bg: "bg-slate-100", text: "text-slate-700" },
  danger: { bg: "bg-red-50", text: "text-red-600" },
};

const SIZE_STYLES: Record<Size, string> = {
  default: "px-4 py-3",
  sm: "px-3 py-1.5",
};

type Props = PressableProps & {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
  loading?: boolean;
};

// Website Button renders arbitrary children (icon + text side by side) via
// CSS flex on the <button> itself - Pressable needs that laid out
// explicitly, so children get wrapped in a row View here.
export function Button({
  variant = "default",
  size = "default",
  className = "",
  disabled,
  loading,
  children,
  ...props
}: Props) {
  const v = VARIANT_STYLES[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      disabled={isDisabled}
      className={`flex-row items-center justify-center gap-1.5 rounded-lg ${SIZE_STYLES[size]} ${v.bg} ${isDisabled ? "opacity-50" : ""} ${className}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "default" ? "#fff" : "#334155"} size="small" />
      ) : typeof children === "string" ? (
        <Text className={`text-sm font-semibold ${v.text}`}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
