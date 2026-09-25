import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { FileText, CheckCircle2, ChevronRight } from "lucide-react-native";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ReportItemsTable from "@/components/ReportItemsTable";
import { api } from "@/api/client";

export default function ReportRequestCard({ c, setC }: { c: any; setC: (c: any) => void }) {
  const [note, setNote] = useState(c.report_requested_note || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showRawOcr, setShowRawOcr] = useState(false);

  async function saveRequest() {
    setBusy(true);
    setErr(null);
    try {
      setC(await api.setReportRequest(c.id, note));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest() {
    setBusy(true);
    setErr(null);
    try {
      setNote("");
      setC(await api.setReportRequest(c.id, null));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function markReviewed() {
    setBusy(true);
    setErr(null);
    try {
      setC(await api.markReportReviewed(c.id));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const items = c.report_structured?.items || [];
  const needsReview = c.report_uploaded_at && !c.report_reviewed_at;

  return (
    <Card className="mb-5">
      <CardHeader>
        <View className="flex-row items-center gap-1.5">
          <FileText size={16} color="#0f172a" />
          <CardTitle>Requested reports</CardTitle>
          {needsReview && <Badge tone="amber">Needs review</Badge>}
        </View>
        <CardDescription>
          Ask the patient to bring back lab or diagnostic reports. They can upload a photo or PDF later, from
          their own account.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="e.g. CBC and chest X-ray"
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={2}
          className="min-h-[56px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
        />
        <View className="flex-row gap-2">
          <Button onPress={saveRequest} disabled={busy || !note.trim()} loading={busy}>
            {c.report_requested_at ? "Update request" : "Request report"}
          </Button>
          {c.report_requested_at && (
            <Button variant="secondary" disabled={busy} onPress={cancelRequest}>
              Cancel
            </Button>
          )}
        </View>
        {err && <Text className="text-xs font-medium text-red-600">{err}</Text>}

        {c.report_uploaded_at && (
          <View className="rounded-lg border border-slate-200 p-3.5">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-slate-900">
                {c.report_file_count} file{c.report_file_count === 1 ? "" : "s"} uploaded by patient
              </Text>
              {needsReview && (
                <Button size="sm" variant="secondary" disabled={busy} onPress={markReviewed}>
                  <View className="flex-row items-center gap-1.5">
                    <CheckCircle2 size={14} color="#334155" />
                    <Text className="text-sm font-semibold text-slate-700">Mark reviewed</Text>
                  </View>
                </Button>
              )}
            </View>
            {c.report_structured?.summary && (
              <Text className="mb-2 text-sm text-slate-700">{c.report_structured.summary}</Text>
            )}
            {items.length > 0 ? (
              <ReportItemsTable items={items} />
            ) : (
              <View>
                <Pressable onPress={() => setShowRawOcr((v) => !v)} className="flex-row items-center gap-1">
                  <ChevronRight
                    size={12}
                    color="#64748b"
                    style={{ transform: [{ rotate: showRawOcr ? "90deg" : "0deg" }] }}
                  />
                  <Text className="text-xs text-slate-500">
                    No structured results extracted {"\u2014"} view raw OCR text
                  </Text>
                </Pressable>
                {showRawOcr && (
                  <View className="mt-2 max-h-48 rounded bg-slate-50 p-2">
                    <Text className="text-xs text-slate-700">{c.report_ocr_text}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </CardContent>
    </Card>
  );
}
