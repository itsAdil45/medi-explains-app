import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronDown, FileDown, Receipt } from "lucide-react-native";

import { api } from "@/api/client";
import { downloadAuthedFile, sharePdf } from "@/api/download";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SafetyBanner from "@/components/SafetyBanner";
import LanguagePicker from "@/components/LanguagePicker";
import AuthAudio from "@/components/AuthAudio";
import MedicationSchedulePanel from "@/components/MedicationSchedulePanel";
import PatientCrossCheck from "@/components/PatientCrossCheck";

type Props = {
  c: any;
  meds: any[];
  langMeta?: { native?: string } | null;
  rtl?: boolean;
  busy: boolean;
  retranslate: (lang: string) => unknown;
  // Must reject on failure - this component shows the message inline. (The
  // screen's own setErr would replace the whole consultation page.)
  downloadPdf: () => Promise<void>;
  refresh: () => Promise<unknown>;
};

function formatVisitDate(isoDate: string) {
  return new Date(isoDate + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function PatientSummaryView({
  c,
  meds,
  langMeta,
  rtl,
  busy,
  retranslate,
  downloadPdf,
  refresh,
}: Props) {
  const summaryText = c.patient_summary_translated || c.doctor_edited_summary || c.patient_summary_en;
  const warningSigns: string[] = c.structured_data?.warning_signs || [];
  const glossary: { term: string; plain_explanation: string }[] = c.structured_data?.glossary || [];
  const [scheduleOpen, setScheduleOpen] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const [billBusy, setBillBusy] = useState(false);
  const [billErr, setBillErr] = useState<string | null>(null);

  async function onDownloadPdf() {
    setPdfErr(null);
    setPdfBusy(true);
    try {
      await downloadPdf();
    } catch (e: any) {
      setPdfErr(e.message || "Could not download your summary");
    } finally {
      setPdfBusy(false);
    }
  }

  async function downloadBill() {
    setBillErr(null);
    setBillBusy(true);
    try {
      const file = await downloadAuthedFile(api.billUrl(c.id), `bill_${c.id}`, ".pdf");
      await sharePdf(file.uri, "Your bill");
    } catch (e: any) {
      setBillErr(e.message || "Could not generate bill");
    } finally {
      setBillBusy(false);
    }
  }

  return (
    <View className="gap-5">
      <View className="gap-4">
        <SafetyBanner />

        <Card>
          <CardHeader>
            <CardTitle>Your doctor-approved summary {langMeta?.native ? `(${langMeta.native})` : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            <Text
              className={`text-sm leading-relaxed text-slate-800 ${rtl ? "text-right text-[16px] leading-loose" : ""}`}
              style={rtl ? { writingDirection: "rtl" } : undefined}
            >
              {summaryText}
            </Text>
          </CardContent>
        </Card>

        {c.audio_summary_path ? (
          <Card>
            <CardHeader>
              <CardTitle>Listen to your summary</CardTitle>
            </CardHeader>
            <CardContent>
              <AuthAudio url={api.audioSummaryUrl(c.id)} />
            </CardContent>
          </Card>
        ) : (
          <View className="rounded-lg bg-amber-50 px-4 py-3">
            <Text className="text-[13px] text-amber-900">
              Audio is unavailable for this saved summary. The approved text remains available.
            </Text>
          </View>
        )}

        {c.next_visit_date && (
          <Card>
            <CardHeader>
              <CardTitle>Your next visit</CardTitle>
            </CardHeader>
            <CardContent>
              <Text className="text-sm leading-5 text-slate-700">
                Your doctor has scheduled a follow-up visit for{" "}
                <Text className="font-bold text-slate-900">{formatVisitDate(c.next_visit_date)}</Text>
                {". You'll get a reminder email a few days before."}
              </Text>
            </CardContent>
          </Card>
        )}

        {warningSigns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Warning signs your doctor discussed</CardTitle>
            </CardHeader>
            <CardContent className="gap-1">
              {warningSigns.map((w, i) => (
                <View key={i} className="flex-row gap-2 pl-1">
                  <Text className="text-sm text-slate-700">{"\u2022"}</Text>
                  <Text className="flex-1 text-sm leading-5 text-slate-700">{w}</Text>
                </View>
              ))}
            </CardContent>
          </Card>
        )}

        {glossary.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Glossary</CardTitle>
            </CardHeader>
            <CardContent className="gap-1.5">
              {glossary.map((g, i) => (
                <Text key={i} className="text-sm leading-5 text-slate-700">
                  <Text className="font-bold text-slate-900">{g.term}</Text>: {g.plain_explanation}
                </Text>
              ))}
            </CardContent>
          </Card>
        )}

        <Button variant="secondary" onPress={onDownloadPdf} disabled={pdfBusy} className="w-full">
          <FileDown size={16} color="#334155" />
          <Text className="text-sm font-semibold text-slate-700">
            {pdfBusy ? "Preparing PDF\u2026" : "Download my summary as PDF"}
          </Text>
        </Button>
        {pdfErr && <Text className="text-xs font-medium text-red-600">{pdfErr}</Text>}

        {c.released_at && (
          <Button variant="secondary" onPress={downloadBill} disabled={billBusy} className="w-full">
            <Receipt size={16} color="#334155" />
            <Text className="text-sm font-semibold text-slate-700">
              {billBusy ? "Preparing bill\u2026" : "Download my bill"}
            </Text>
          </Button>
        )}
        {billErr && <Text className="text-xs font-medium text-red-600">{billErr}</Text>}

        {c.released_at && <PatientCrossCheck consultation={c} onChange={refresh} />}
      </View>

      <View className="gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Switch language</CardTitle>
          </CardHeader>
          <CardContent>
            <LanguagePicker value={c.patient_language} onChange={retranslate} disabled={busy} includeNotice={false} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your medications</CardTitle>
          </CardHeader>
          <CardContent>
            {!meds.length ? (
              <Text className="text-xs text-slate-500">None recorded.</Text>
            ) : (
              <View className="gap-2">
                {meds.map((m, i) => (
                  <View key={i} className="rounded-lg border border-slate-200 px-3.5 py-3">
                    <Text className="text-sm font-semibold text-slate-900">{m.name || m.canonical_name}</Text>
                    <Text className="mt-1 text-xs leading-4 text-slate-500">
                      {[
                        m.dose || m.strength,
                        m.frequency,
                        m.food_instruction || m.timing,
                        m.duration,
                      ]
                        .map((part) => part || "\u2014")
                        .join(" \u00b7 ")}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>
      </View>

      <Card>
        <Pressable
          onPress={() => setScheduleOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: scheduleOpen }}
          className="flex-row items-center justify-between rounded-xl p-5"
        >
          <Text className="flex-1 text-sm font-bold text-slate-900">Medication timetable {"&"} reminders</Text>
          <ChevronDown
            size={16}
            color="#94a3b8"
            style={{ transform: [{ rotate: scheduleOpen ? "180deg" : "0deg" }] }}
          />
        </Pressable>
        {scheduleOpen && (
          <CardContent>
            <MedicationSchedulePanel consultationId={c.id} />
          </CardContent>
        )}
      </Card>
    </View>
  );
}
