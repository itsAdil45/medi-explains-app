import { useEffect, useRef } from "react";
import { DefaultTheme, Stack, ThemeProvider, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import "../../global.css";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { AuthProvider } from "@/api/auth";
import { AccessibilityProvider } from "@/context/AccessibilityContext";
import { cancelSpeech } from "@/voice/speech";

SplashScreen.preventAutoHideAsync();

// Every screen is drawn light, so the navigator's own background has to be
// light too - with the dark theme it flashed black behind each transition.
const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: "#ffffff" },
};

// Spoken prompts (voice assistant, queue call-out, phone sign-in) share one
// app-wide speech channel, and the screen that started one may stay mounted
// in the background. Silence it whenever the patient moves to another screen.
function StopSpeechOnNavigate() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    cancelSpeech();
  }, [pathname]);
  return null;
}

// Native equivalent of main.jsx's <BrowserRouter><AuthProvider><AccessibilityProvider><App /></...></...> -
// expo-router's file-based Stack stands in for BrowserRouter/App's <Routes>.
export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <AnimatedSplashOverlay />
      <StopSpeechOnNavigate />
      <AuthProvider>
        <AccessibilityProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              // Same smooth horizontal push on Android as on iOS (Android's
              // default is a fade-from-bottom that reads as a jump).
              animation: "ios_from_right",
              contentStyle: { backgroundColor: "#ffffff" },
              // Screens underneath stop re-rendering while covered.
              freezeOnBlur: true,
            }}
          >
            {/* Switching between the signed-out home, onboarding and the
                signed-in tabs replaces the whole screen - a fade reads as
                intended there, a slide as a glitch. */}
            <Stack.Screen name="index" options={{ animation: "fade" }} />
            <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
            <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
            <Stack.Screen name="login" options={{ presentation: "modal" }} />
            <Stack.Screen
              name="phone-sign-in"
              options={{ presentation: "modal" }}
            />
            <Stack.Screen name="profile" />
            <Stack.Screen
              name="consultation/[id]"
              options={{ title: "Consultation" }}
            />
          </Stack>
        </AccessibilityProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
