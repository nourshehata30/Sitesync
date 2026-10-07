import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { BackHandler, SafeAreaView } from "react-native";
import { Edit } from "./src/screens/Edit";
import { List } from "./src/screens/List";
import { Login } from "./src/screens/Login";
import { AppProvider, useApp } from "./src/store";
import { colors } from "./src/ui";

function Root() {
  const { token, ready } = useApp();
  const [route, setRoute] = useState<{ id: string | null } | null>(null);

  React.useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (route) { setRoute(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [route]);

  if (!ready) return null;
  if (!token) return <Login />;
  return route ? <Edit id={route.id} close={() => setRoute(null)} /> : <List open={(id) => setRoute({ id })} />;
}

export default function App() {
  return (
    <AppProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        <Root />
      </SafeAreaView>
    </AppProvider>
  );
}
