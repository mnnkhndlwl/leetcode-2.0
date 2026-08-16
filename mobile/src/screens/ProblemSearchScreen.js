import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

import { searchProblems } from "../api/problems";

import { DIFFICULTY_COLOR } from "./sharedStyles";

export default function ProblemSearchScreen({ navigation }) {
  const [q, setQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const limit = 50;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["problems", "search", searchQ],
    queryFn: () => searchProblems(searchQ, limit),
    enabled: searchQ != null,
  });

  const list = useMemo(() => data ?? [], [data]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Search Problems</Text>

      <View style={styles.searchRow}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Type a title or keyword (e.g., two sum)"
          placeholderTextColor="#6b6b80"
          style={styles.input}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => setSearchQ(q)}
        >
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#ffa116" />
        </View>
      ) : isError ? (
        <Text style={styles.muted}>Couldn't load results.</Text>
      ) : list.length ? (
        list.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={styles.problemRow}
            onPress={() =>
              navigation.navigate("Submit", { slug: p.slug, title: p.title })
            }
          >
            <View style={styles.problemLeft}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: DIFFICULTY_COLOR[p.difficulty] },
                ]}
              />
              <Text style={styles.problemTitle} numberOfLines={1}>
                {p.title}
              </Text>
            </View>
            <Text
              style={[
                styles.problemDifficulty,
                { color: DIFFICULTY_COLOR[p.difficulty] },
              ]}
            >
              {p.difficulty}
            </Text>
          </TouchableOpacity>
        ))
      ) : (
        <Text style={styles.muted}>No problems match.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f17" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  center: { justifyContent: "center", alignItems: "center", flex: 1 },
  title: { fontSize: 26, fontWeight: "900", color: "#e8e8f0", marginBottom: 14 },

  searchRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  input: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    color: "#e8e8f0",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a40",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  searchBtn: { backgroundColor: "#ffa116", borderRadius: 12, paddingHorizontal: 16, justifyContent: "center" },
  searchBtnText: { color: "#0f0f17", fontWeight: "900" },

  muted: { color: "#6b6b80", fontSize: 14 },

  problemRow: {
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a2a40",
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  problemLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  problemTitle: { color: "#e8e8f0", fontWeight: "700", flex: 1 },
  problemDifficulty: { fontWeight: "800" },
});

