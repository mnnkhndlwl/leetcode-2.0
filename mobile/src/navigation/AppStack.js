import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import SubmitScreen from "../screens/SubmitScreen";

const Stack = createNativeStackNavigator();

export default function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="Submit"
        component={SubmitScreen}
        options={({ route }) => ({
          headerShown: true,
          title: route.params?.title ?? "Submit",
          headerStyle: { backgroundColor: "#0f0f17" },
          headerTintColor: "#e8e8f0",
          headerShadowVisible: false,
        })}
      />
    </Stack.Navigator>
  );
}
