import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Upload, CheckCircle2, ClipboardCheck } from "lucide-react-native";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ReportItemsTable from "@/components/ReportItemsTable";
import { api } from "@/api/client";

type PickedFile = { uri: string; name: string; type: string };

export default function ReportUploadCard({ c, setC }: { c: any; setC: (c: any) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: PickedFile) {
    setBusy(true);
    setErr(null);
    try {
      setC(await api.uploadReport(c.id, file));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErr("Photo library access is needed to upload a report photo.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    await upload({ uri: asset.uri, name: asset.fileName || "report.jpg", type: asset.mimeType || "image/jpeg" });
  }

  async function pickPdf() {
    const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    await upload({ uri: asset.uri, name: asset.name || "report.pdf", type: asset.mimeType || "application/pdf" });
  }

  // A single web <input accept="image/*,.pdf"> lets the browser show one
  // picker for both; RN's image and document pickers are separate APIs, so
  // this asks which kind first instead.
  function choose() {
    Alert.alert("Upload report", "Choose a photo or a PDF file.", [
      { text: "Photo", onPress: pickPhoto },
      { text: "PDF file", onPress: pickPdf },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  // Extracted values are unverified OCR/AI output until the doctor has
  // actually looked at them - shown to the patient only once reviewed,
  // matching how the rest of this app gates AI-extracted content (the visit
  // summary, medications) behind explicit doctor approval first.
  const reviewed = Boolean(c.report_reviewed_at);
  const items = c.report_structured?.items || [];

  return (
    <Card className="mb-5" style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a" }}>
      <CardHeader>
        <CardTitle>{"\ud83d\udccb"} Your doctor requested a report</CardTitle>
        <CardDescription className="text-slate-700">{c.report_requested_note}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {c.report_uploaded_at && !reviewed && (
          <View className="flex-row items-center gap-2">
            <CheckCircle2 size={16} color="#047857" />
            <Text className="text-sm font-medium text-emerald-700">
              {c.report_file_count} file{c.report_file_count === 1 ? "" : "s"} uploaded {"\u2014"} your doctor will
              review it.
            </Text>
          </View>
        )}

        {reviewed && (
          <View className="rounded-lg border border-emerald-200 bg-white p-3.5">
            <View className="mb-2 flex-row items-center gap-2">
              <ClipboardCheck size={16} color="#047857" />
              <Text className="text-sm font-semibold text-emerald-700">Reviewed by your doctor</Text>
            </View>
            {c.report_structured?.summary && (
              <Text className="mb-2 text-sm text-slate-700">{c.report_structured.summary}</Text>
            )}
            {items.length > 0 && <ReportItemsTable items={items} />}
            <Text className="mt-2 text-xs text-slate-500">
              If anything here is flagged, follow up with your doctor rather than acting on this alone.
            </Text>
          </View>
        )}

        <Button variant="secondary" disabled={busy} onPress={choose} loading={busy}>
          <View className="flex-row items-center gap-1.5">
            <Upload size={16} color="#334155" />
            <Text className="text-sm font-semibold text-slate-700">
              {c.report_uploaded_at ? "Upload another file" : "Upload photo or PDF"}
            </Text>
          </View>
        </Button>
        {err && <Text className="text-xs font-medium text-red-600">{err}</Text>}
      </CardContent>
    </Card>
  );
}
