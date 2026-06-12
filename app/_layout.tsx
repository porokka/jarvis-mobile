import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#06060b" }}>
      <StatusBar style="light" backgroundColor="#06060b" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#06060b" },
          animation: "none",
        }}
      />
    </GestureHandlerRootView>
  );
}
