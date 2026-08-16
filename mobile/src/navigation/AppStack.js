import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import SubmitScreen from "../screens/SubmitScreen";
import ContestsScreen from "../screens/ContestsScreen";
import ContestDetailScreen from "../screens/ContestDetailScreen";
import ProblemSearchScreen from "../screens/ProblemSearchScreen";
import CompletedScreen from "../screens/CompletedScreen";
import GapsScreen from "../screens/GapsScreen";

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
      <Stack.Screen
        name="Contests"
        component={ContestsScreen}
        options={{
          headerShown: true,
          title: "Contests",
          headerStyle: { backgroundColor: "#0f0f17" },
          headerTintColor: "#e8e8f0",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="ContestDetail"
        component={ContestDetailScreen}
        options={({ route }) => ({
          headerShown: true,
          title: route.params?.title ?? "Contest",
          headerStyle: { backgroundColor: "#0f0f17" },
          headerTintColor: "#e8e8f0",
          headerShadowVisible: false,
        })}
      />
      <Stack.Screen
        name="ProblemSearch"
        component={ProblemSearchScreen}
        options={{
          headerShown: true,
          title: "Search",
          headerStyle: { backgroundColor: "#0f0f17" },
          headerTintColor: "#e8e8f0",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="Completed"
        component={CompletedScreen}
        options={{
          headerShown: true,
          title: "Completed",
          headerStyle: { backgroundColor: "#0f0f17" },
          headerTintColor: "#e8e8f0",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="Gaps"
        component={GapsScreen}
        options={{
          headerShown: true,
          title: "Gaps",
          headerStyle: { backgroundColor: "#0f0f17" },
          headerTintColor: "#e8e8f0",
          headerShadowVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}
