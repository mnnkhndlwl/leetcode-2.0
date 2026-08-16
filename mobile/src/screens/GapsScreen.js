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

import { getMyContests, getProblemStatus } from "../api/me";

const GREY_DOT = "#2a2a40";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return iso.slice(0, 10);
  } catch {
    return "—";
  }
}

export default function GapsScreen({ navigation }) {
  const {
    data: myContests,
    isLoading: contestsLoading,
    isError: contestsError,
  } = useQuery({
    queryKey: ["me", "contests"],
    queryFn: getMyContests,
  });

  const {
    data: unsolved,
    isLoading: problemsLoading,
    isError: problemsError,
  } = useQuery({
    queryKey: ["me", "problem-status", "UNSOLVED"],
    queryFn: () => getProblemStatus({ status: "UNSOLVED", limit: 10 }),
  });

  const contestsToJoin = useMemo(() => {
    return (myContests ?? []).filter((c) => !c.registered);
  }, [myContests]);

  if (contestsLoading || problemsLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#ffa116" />
      </View>
    );
  }

  if (contestsError || problemsError) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>Couldn't load your gaps.</Text>
      </View>
    );
  }

  const problemList = unsolved ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Gaps</Text>
      <Text style={styles.subtitle}>What you haven't done yet — and what's next.</Text>

      <Text style={styles.sectionTitle}>Contests you can join</Text>
      {contestsToJoin.length === 0 ? (
        <Text style={styles.muted}>You're registered for all contests.</Text>
      ) : (
        contestsToJoin.map((c) => (
          <View key={c.contestId} style={styles.rowCard}>
            <Text style={styles.rowTitle} numberOfLines={1}>{c.title}</Text>
            <Text style={styles.rowMeta}>{c.status}</Text>
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={() =>
                navigation.navigate("ContestDetail", { slug: c.slug, title: c.title })
              }
            >
              <Text style={styles.smallBtnText}>Enter</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Problems to solve next</Text>
      {problemList.length === 0 ? (
        <Text style={styles.muted}>No gaps found.</Text>
      ) : (
        problemList.map((p) => (
          <TouchableOpacity
            key={p.problemId}
            style={styles.problemRow}
            onPress={() =>
              navigation.navigate("Submit", { slug: p.slug, title: p.title })
            }
          >
            <View style={styles.problemLeft}>
              <View style={[styles.dot, { backgroundColor: GREY_DOT }]} />
              <Text style={styles.problemTitle} numberOfLines={1}>{p.title}</Text>
            </View>
            <Text style={styles.problemDate}>{formatDate(p.lastAttemptedAt)}</Text>
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

  title: { fontSize: 26, fontWeight: "900", color: "#e8e8f0", marginBottom: 6 },
  subtitle: { color: "#6b6b80", fontSize: 14, marginBottom: 16 },

  muted: { color: "#6b6b80", fontSize: 14 },

  sectionTitle: { color: "#e8e8f0", fontWeight: "800", fontSize: 16, marginBottom: 10 },

  rowCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a2a40",
    padding: 14,
    marginBottom: 10,
  },
  rowTitle: { color: "#e8e8f0", fontWeight: "800", fontSize: 14, marginBottom: 6 },
  rowMeta: { color: "#6b6b80", fontSize: 12, marginBottom: 10 },

  smallBtn: {
    backgroundColor: "#ffa116",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  smallBtnText: { color: "#0f0f17", fontWeight: "900" },

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
  problemDate: { color: "#6b6b80", fontSize: 12, fontWeight: "600" },
});

