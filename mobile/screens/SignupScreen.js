import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { signup } from "../api/auth";

export default function SignupScreen({ navigation }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!username.trim() || !email.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }
    try {
      setLoading(true);
      const { user, token } = await signup(username.trim(), email.trim(), password);
      navigation.replace("Home", { user, token });
    } catch (err) {
      Alert.alert("Signup failed", err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.logo}>{"<LC/>"}</Text>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Start your coding journey</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#4a4a5a"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#4a4a5a"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#4a4a5a"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0f0f17" />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("Login")}>
            <Text style={styles.link}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f17" },
  inner: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  logo: {
    fontSize: 36,
    fontWeight: "800",
    color: "#ffa116",
    marginBottom: 24,
    textAlign: "center",
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#e8e8f0",
    marginBottom: 6,
  },
  subtitle: { fontSize: 15, color: "#6b6b80", marginBottom: 32 },
  input: {
    backgroundColor: "#1a1a2e",
    color: "#e8e8f0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#2a2a40",
  },
  button: {
    backgroundColor: "#ffa116",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 6,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#0f0f17", fontWeight: "700", fontSize: 16 },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },
  footerText: { color: "#6b6b80", fontSize: 14 },
  link: { color: "#ffa116", fontSize: 14, fontWeight: "600" },
});
