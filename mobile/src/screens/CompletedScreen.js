import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

import { getProblemStatus } from "../api/me";
function formatDate(iso) {
  if (!iso) return "--";
  try {
    return iso.slice(0, 10);
  } catch {
    return "--";
  }
}

export default function CompletedScreen({ navigation }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["me", "problem-status", "SOLVED"],
    queryFn: () => getProblemStatus({ status: "SOLVED", limit: 50 }),
  });

  const list = useMemo(() => data ?? [], [data]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#ffa116" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>Couldn't load completed problems.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Completed</Text>

      {list.length === 0 ? (
        <Text style={styles.muted}>No solved problems yet.</Text>
      ) : (
        list.map((p) => (
          <TouchableOpacity
            key={p.problemId}
            style={styles.problemRow}
            onPress={() =>
              navigation.navigate("Submit", { slug: p.slug, title: p.title })
            }
          >
            <View style={styles.problemLeft}>
              <View style={[styles.dot, { backgroundColor: "#2a2a40" }]} />
              <Text style={styles.problemTitle} numberOfLines={1}>
                {p.title}
              </Text>
            </View>
            <Text style={styles.dateText}>{formatDate(p.solvedAt)}</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f17" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  center: { justifyContent: "center", alignItems: "center", flex: 1 },
  muted: { color: "#6b6b80", fontSize: 14 },
  title: { fontSize: 26, fontWeight: "900", color: "#e8e8f0", marginBottom: 14 },

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
  dateText: { color: "#6b6b80", fontSize: 13, fontWeight: "600" },
});

