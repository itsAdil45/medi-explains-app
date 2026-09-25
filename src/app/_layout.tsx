import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";
import "../../global.css";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { AuthProvider } from "@/api/auth";
import { AccessibilityProvider } from "@/context/AccessibilityContext";

SplashScreen.preventAutoHideAsync();

// Native equivalent of main.jsx's <BrowserRouter><AuthProvider><AccessibilityProvider><App /></...></...> -
// expo-router's file-based Stack stands in for BrowserRouter/App's <Routes>.
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AuthProvider>
        <AccessibilityProvider>
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
              options={{
                headerShown: false,
                title: "Consultation",
                headerBackTitle: "white",
              }}
            />
          </Stack>
        </AccessibilityProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
