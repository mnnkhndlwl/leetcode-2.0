import { NavigationContainer } from "@react-navigation/native";
import useUserStore from "../store/useUserStore";
import AuthStack from "./AuthStack";
import AppStack from "./AppStack";

// MMKV is synchronous — Zustand persist rehydrates the store before the
// first render, so there is no async loading state to handle here.
export default function Navigation() {
  const user = useUserStore((s) => s.user);

  console.log("user", user);

  return (
    <NavigationContainer>
      {user ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
}
