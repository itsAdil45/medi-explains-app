import { useState } from "react";
import { View, Text, TextInput, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { api } from "@/api/client";
import { downloadAuthedFile, sharePdf } from "@/api/download";
import { Button } from "@/components/ui/button";

/**
 * Compact share panel: generates a signed link, displays it, provides a
 * WhatsApp deep-link and a PDF download.
 */
export default function ShareDialog({ consultationId }: { consultationId: string }) {
  const [phone, setPhone] = useState("");
  const [link, setLink] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setErr(null);
    setCopied(false);
    try {
      setLink(await api.createShareLink(consultationId, phone || undefined));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    await Clipboard.setStringAsync(link.share_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function openWhatsApp() {
    if (!link) return;
    try {
      await Linking.openURL(link.whatsapp_url);
    } catch (e: any) {
      setErr("Could not open WhatsApp: " + e.message);
    }
  }

  // No browser download to trigger natively - fetch the PDF ourselves, write
  // it to the app's cache, then hand it to the OS share sheet so the doctor
  // can save it to Files, AirDrop it, etc.
  async function downloadPdf() {
    setErr(null);
    setPdfBusy(true);
    try {
      const file = await downloadAuthedFile(api.pdfUrl(consultationId), `care_summary_${consultationId}`, ".pdf");
      await sharePdf(file.uri, "Your care summary");
    } catch (e: any) {
      setErr(String(e.message || e));
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <View>
      <Text className="text-sm font-bold text-slate-900">Share this summary with the patient</Text>

      <View className="mt-2.5">
        <Text className="mb-1 text-xs font-semibold text-slate-700">
          Patient phone (optional {"\u2014"} for WhatsApp deep-link)
        </Text>
        <TextInput
          keyboardType="phone-pad"
          placeholder="+923001234567"
          placeholderTextColor="#94a3b8"
          value={phone}
          onChangeText={setPhone}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
        />
      </View>

      <View className="mt-2.5 flex-row flex-wrap gap-2">
        <Button onPress={generate} disabled={busy} loading={busy}>
          {link ? "Regenerate link" : "Generate share link"}
        </Button>
        <Button variant="secondary" onPress={downloadPdf} disabled={pdfBusy} loading={pdfBusy}>
          {"\ud83d\udcc4"} Download PDF
        </Button>
      </View>

      {err && <Text className="mt-2 text-xs font-medium text-red-600">{err}</Text>}

      {link && (
        <>
          <Text className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700" selectable>
            {link.share_url}
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            <Button onPress={openWhatsApp}>{"\ud83d\udcf1"} Open WhatsApp</Button>
            <Button variant="secondary" onPress={copyLink}>
              {copied ? "\u2713 Copied" : "\ud83d\udccb Copy link"}
            </Button>
          </View>
          <Text className="mt-2 text-xs text-slate-500">
            Link is valid for {link.expires_in_hours} hours. Patient does not need an account.
          </Text>
        </>
      )}
    </View>
  );
}
