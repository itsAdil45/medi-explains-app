import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";
import "../../global.css";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { AuthProvider } from "@/api/auth";

SplashScreen.preventAutoHideAsync();

// Native equivalent of main.jsx's <BrowserRouter><AuthProvider><App /></...> -
// expo-router's file-based Stack stands in for BrowserRouter/App's <Routes>,
// so AuthProvider just needs to wrap it the same way. (AccessibilityProvider
// from main.jsx isn't mimicked yet - out of scope until that context itself
// is ported.)
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="login"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="phone-sign-in"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="consultation/[id]"
            options={{ headerShown: true, title: "Consultation", headerBackTitle: "Back" }}
          />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
