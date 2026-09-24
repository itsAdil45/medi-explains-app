// Authenticated file downloads for a native app.
//
// The website fetched protected files (bill PDF, summary audio) as a Blob and
// then used URL.createObjectURL(...) / an <a download> to open or save them.
// React Native has neither, so this fetches with the same Authorization
// header the api client uses, writes the bytes into the app cache, and
// returns the File - callers hand its uri to the share sheet or an audio
// player.
//
// This deliberately does NOT use FileSystem.downloadAsync / cacheDirectory:
// on SDK 57 those only exist on the main "expo-file-system" export as
// deprecated stubs that throw at runtime (the old API moved to
// "expo-file-system/legacy"). The File/Paths API below is the supported one.
import { fetch } from "expo/fetch";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { getToken } from "@/api/client";

// The backend decides the audio container (mp3/wav/...), and players on some
// platforms lean on the file extension, so pick it from the response.
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
};

async function failureMessage(res: Awaited<ReturnType<typeof fetch>>) {
  // Same shape api/client.ts reads errors from: { detail: string | object }.
  try {
    const body = await res.json();
    if (body?.detail) return typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch {
    // Not JSON (e.g. a proxy error page) - fall through to the status code.
  }
  return `Request failed (${res.status})`;
}

/**
 * GETs `url` with the user's bearer token and saves the body to the app cache.
 *
 * @param baseName     File name without extension, e.g. `bill_12`. Use a unique
 *                     name if the file may still be open (e.g. being played).
 * @param fallbackExt  Extension to use (with dot) when the server's
 *                     content-type isn't one we recognise.
 */
export async function downloadAuthedFile(
  url: string,
  baseName: string,
  fallbackExt = "",
  { signal }: { signal?: AbortSignal } = {},
): Promise<File> {
  const token = await getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal,
  });
  if (!res.ok) throw new Error(await failureMessage(res));

  const mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const file = new File(Paths.cache, baseName + (EXT_BY_MIME[mime] ?? fallbackExt));
  if (file.exists) file.delete();
  file.write(await res.bytes());
  return file;
}

/** Opens the OS share sheet (save to Files, AirDrop, WhatsApp, ...) for a local PDF. */
export async function sharePdf(uri: string, dialogTitle?: string) {
  // Throw rather than silently doing nothing - otherwise the button appears
  // to work and the person never gets their file.
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle });
}
