import { useMemo } from "react";
import { AppProvider, useApp } from "./context";
import { MenuScreen } from "./screens/MenuScreen";
import { CheckoutScreen } from "./screens/CheckoutScreen";
import { ConfirmationScreen } from "./screens/ConfirmationScreen";
import { readTableConfig } from "./utils";

function Router() {
  const { screen } = useApp();
  switch (screen) {
    case "menu":          return <MenuScreen />;
    case "checkout":      return <CheckoutScreen />;
    case "confirmation":  return <ConfirmationScreen />;
    default:              return <MenuScreen />;
  }
}

export default function App() {
  const config = useMemo(() => readTableConfig(), []);

  return (
    <AppProvider config={config}>
      <Router />
    </AppProvider>
  );
}
