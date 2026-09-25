import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/api/auth";

const STORAGE_KEY = "mxp_voice_wake_enabled";

type AccessibilityContextValue = {
  voiceWakeEnabled: boolean;
  setVoiceWakeEnabled: (v: boolean) => void;
  voiceWakeForced: boolean;
};

const AccessibilityCtx = createContext<AccessibilityContextValue | null>(null);

// Not shared with us - the website's context/AccessibilityContext.jsx and
// pages/AccessibilitySettings.jsx haven't been provided, so this infers only
// the one thing VoiceAssistant.jsx actually needs: a per-account "hands-free
// is always on" override. Inferred the same way other account-level settings
// (e.g. doctor_fee) come through - as a field on the signed-in user object.
// If the real field name differs, this is the one line to fix.
export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const voiceWakeForced = Boolean((user as any)?.voice_wake_forced);

  const [stored, setStored] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v !== null) setStored(v === "true");
    });
  }, []);

  function setVoiceWakeEnabled(v: boolean) {
    setStored(v);
    AsyncStorage.setItem(STORAGE_KEY, String(v)).catch(() => {});
  }

  return (
    <AccessibilityCtx.Provider
      value={{ voiceWakeEnabled: voiceWakeForced || stored, setVoiceWakeEnabled, voiceWakeForced }}
    >
      {children}
    </AccessibilityCtx.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityCtx);
  if (!ctx) throw new Error("useAccessibility must be used within an AccessibilityProvider");
  return ctx;
}
