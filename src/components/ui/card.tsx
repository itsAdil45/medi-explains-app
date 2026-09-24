import { View, Text, type ViewProps, type TextProps } from "react-native";

// No ui/card.tsx exists in this project yet - every screen that mimics a
// website page using @/components/ui/card needs one, so this is shared
// rather than reinvented per-screen like login.tsx's one-off Badge was.
export function Card({ className = "", ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-xl border border-slate-200 bg-white ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }: ViewProps & { className?: string }) {
  return <View className={`gap-1 p-4 ${className}`} {...props} />;
}

export function CardTitle({ className = "", ...props }: TextProps & { className?: string }) {
  return (
    <Text className={`text-[15px] font-bold text-slate-900 ${className}`} {...props} />
  );
}

export function CardDescription({ className = "", ...props }: TextProps & { className?: string }) {
  return <Text className={`text-xs text-slate-500 ${className}`} {...props} />;
}

export function CardContent({ className = "", ...props }: ViewProps & { className?: string }) {
  return <View className={`p-4 pt-0 ${className}`} {...props} />;
}
