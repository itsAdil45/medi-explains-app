import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Receipt, Plus, Trash2, FileDown } from "lucide-react-native";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/api/client";
import { downloadAuthedFile, sharePdf } from "@/api/download";

type BillItem = { description: string; amount: number | string };

async function downloadBill(id: string) {
  const file = await downloadAuthedFile(api.billUrl(id), `bill_${id}`, ".pdf");
  await sharePdf(file.uri, "Bill");
}

export default function BillCard({
  c,
  setC,
  doctorFee,
}: {
  c: any;
  setC: (c: any) => void;
  doctorFee?: number;
}) {
  const [items, setItems] = useState<BillItem[]>(c.bill_items || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const total = (doctorFee || 0) + items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  function addRow() {
    setItems((x) => [...x, { description: "", amount: 0 }]);
  }

  function updateRow(i: number, field: keyof BillItem, value: string) {
    setItems((x) => x.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }

  function removeRow(i: number) {
    setItems((x) => x.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const cleaned = items
        .filter((i) => String(i.description).trim())
        .map((i) => ({ description: String(i.description).trim(), amount: Number(i.amount) || 0 }));
      setItems(cleaned);
      setC(await api.setBillItems(c.id, cleaned));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setErr(null);
    try {
      await downloadBill(c.id);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <Card className="mb-5">
      <CardHeader>
        <View className="flex-row items-center gap-1.5">
          <Receipt size={16} color="#0f172a" />
          <CardTitle>Bill</CardTitle>
        </View>
        <CardDescription>
          Consultation fee: {doctorFee ? doctorFee.toLocaleString() : "not set \u2014 add it on your profile"}.
          Add any itemized charges below.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {items.map((item, i) => (
          <View key={i} className="flex-row items-center gap-2">
            <Input
              placeholder="Description"
              value={String(item.description)}
              onChangeText={(t) => updateRow(i, "description", t)}
              className="flex-1"
            />
            <Input
              keyboardType="decimal-pad"
              placeholder="Amount"
              value={String(item.amount)}
              onChangeText={(t) => updateRow(i, "amount", t)}
              className="w-24"
            />
            <Pressable
              onPress={() => removeRow(i)}
              className="size-9 items-center justify-center rounded-lg bg-slate-100"
            >
              <Trash2 size={14} color="#475569" />
            </Pressable>
          </View>
        ))}

        <View className="flex-row flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onPress={addRow}>
            <View className="flex-row items-center gap-1.5">
              <Plus size={14} color="#334155" />
              <Text className="text-sm font-semibold text-slate-700">Add line item</Text>
            </View>
          </Button>
          <Button size="sm" disabled={busy} onPress={save} loading={busy}>
            Save
          </Button>
          <Button size="sm" variant="secondary" onPress={download}>
            <View className="flex-row items-center gap-1.5">
              <FileDown size={14} color="#334155" />
              <Text className="text-sm font-semibold text-slate-700">Download bill PDF</Text>
            </View>
          </Button>
        </View>

        <Text className="text-sm font-semibold text-slate-900">Total: {total.toLocaleString()}</Text>
        {err && <Text className="text-xs font-medium text-red-600">{err}</Text>}
      </CardContent>
    </Card>
  );
}
