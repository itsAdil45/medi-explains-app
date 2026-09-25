import { View, Text, ScrollView } from "react-native";

type ReportItem = {
  test?: string;
  value?: string;
  unit?: string;
  reference_range?: string;
  flag?: "normal" | "low" | "high" | "abnormal" | string;
};

const FLAG_COLOR: Record<string, string> = {
  normal: "text-emerald-700",
  low: "text-amber-700",
  high: "text-amber-700",
  abnormal: "text-red-700",
};

const COL = { test: 130, value: 90, unit: 70, range: 130, flag: 80 };

export default function ReportItemsTable({ items }: { items: ReportItem[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View className="flex-row border-b border-slate-200 pb-1">
          <Text style={{ width: COL.test }} className="text-xs font-medium text-slate-500">
            Test
          </Text>
          <Text style={{ width: COL.value }} className="text-xs font-medium text-slate-500">
            Value
          </Text>
          <Text style={{ width: COL.unit }} className="text-xs font-medium text-slate-500">
            Unit
          </Text>
          <Text style={{ width: COL.range }} className="text-xs font-medium text-slate-500">
            Reference range
          </Text>
          <Text style={{ width: COL.flag }} className="text-xs font-medium text-slate-500">
            Flag
          </Text>
        </View>
        {items.map((item, i) => (
          <View key={i} className="flex-row border-t border-slate-100 py-1.5">
            <Text style={{ width: COL.test }} className="text-xs font-medium text-slate-900">
              {item.test}
            </Text>
            <Text style={{ width: COL.value }} className="text-xs text-slate-800">
              {item.value}
            </Text>
            <Text style={{ width: COL.unit }} className="text-xs text-slate-800">
              {item.unit}
            </Text>
            <Text style={{ width: COL.range }} className="text-xs text-slate-800">
              {item.reference_range}
            </Text>
            <Text style={{ width: COL.flag }} className={`text-xs font-semibold ${FLAG_COLOR[item.flag || ""] || "text-slate-500"}`}>
              {item.flag || "\u2014"}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
