import { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";

type PickedFile = { uri: string; name: string; type: string };

export default function PrescriptionUpload({
  consultationId,
  onExtracted,
}: {
  consultationId: string;
  onExtracted?: (result: any) => void;
}) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [result, setResult] = useState<any>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function choosePhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErr("Photo library access is needed to pick a prescription photo.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setFile({
      uri: asset.uri,
      name: asset.fileName || "prescription.jpg",
      type: asset.mimeType || "image/jpeg",
    });
    setResult(null);
    setErr(null);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.uploadPrescription(consultationId, file);
      setResult(res);
      setText(res.text || "");
      onExtracted?.(res);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCorrection() {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.correctPrescriptionOcr(consultationId, text);
      setResult(res);
      onExtracted?.(res);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Pressable
        onPress={choosePhoto}
        className={`items-center rounded-lg border border-dashed px-4 py-6 ${file ? "border-[#4ab96a] bg-[#4ab96a]/5" : "border-slate-300"}`}
      >
        {file ? (
          <Text className="text-sm text-slate-700">
            {"\ud83d\udcce"} <Text className="font-semibold">{file.name}</Text>
          </Text>
        ) : (
          <Text className="text-sm text-slate-500">{"\ud83d\udcf7"} Choose a prescription photo</Text>
        )}
      </Pressable>

      <Button
        className="mt-2.5"
        variant="secondary"
        disabled={!file || busy}
        loading={busy && !result}
        onPress={upload}
      >
        {busy && !result ? "Processing\u2026" : "Run OCR"}
      </Button>

      {err && <Text className="mt-2 text-xs font-medium text-red-600">{err}</Text>}

      {result && (
        <View className="mt-3 gap-2">
          <Text className="text-xs text-slate-500">
            OCR engine: <Text className="font-semibold text-slate-700">{result.engine || "unavailable"}</Text>
            {" \u00b7 confidence "}
            <Text className="font-semibold text-slate-700">{Math.round((result.confidence || 0) * 100)}%</Text>
          </Text>
          {result.warning && (
            <View className="rounded-lg bg-amber-50 px-3 py-2.5">
              <Text className="text-xs text-amber-900">{"\u26a0"} {result.warning}</Text>
            </View>
          )}
          <Text className="text-xs font-semibold text-slate-700">
            Extracted text {"\u2014"} correct OCR errors before using it
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            className="min-h-[120px] rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900"
          />
          <Button variant="secondary" size="sm" disabled={busy || text === result.text} onPress={saveCorrection}>
            Save corrected OCR text & re-extract fields
          </Button>
          {result.structured?.medications?.length ? (
            <Text className="text-xs text-slate-500">
              {result.structured.medications.length} medication candidate(s) extracted. They are not
              automatically confirmed or scheduled.
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
