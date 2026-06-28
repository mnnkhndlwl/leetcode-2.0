import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import useUserStore from "../store/useUserStore";
import { getProblems } from "../api/problems";
import { queryClient } from "../api/queryClient";

const STATS = [
  { label: "Solved", value: "0", color: "#00b8a3" },
  { label: "Ranking", value: "--", color: "#ffa116" },
  { label: "Streak", value: "0d", color: "#ef4743" },
];

const DIFFICULTY_BARS = [
  { label: "Easy", count: 0, total: 860, color: "#00b8a3" },
  { label: "Medium", count: 0, total: 1800, color: "#ffa116" },
  { label: "Hard", count: 0, total: 790, color: "#ef4743" },
];

const DIFFICULTY_COLOR = { Easy: "#00b8a3", Medium: "#ffa116", Hard: "#ef4743" };

export default function HomeScreen({ navigation }) {
  const user = useUserStore((s) => s.user);
  const logout = useUserStore((s) => s.logout);

  const {
    data: problems,
    isLoading: problemsLoading,
    isError: problemsError,
  } = useQuery({
    queryKey: ["problems"],
    queryFn: getProblems,
  });

  function handleLogout() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          logout(); // clears persisted auth -> navigation switches to AuthStack
          queryClient.clear(); // drop cached server data for the logged-out user
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Hello, {user?.username ?? "Coder"} 👋
          </Text>
          <Text style={styles.subGreeting}>Ready to grind today?</Text>
        </View>
        <TouchableOpacity style={styles.avatar} onPress={handleLogout}>
          <Text style={styles.avatarText}>
            {(user?.username?.[0] ?? "U").toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {STATS.map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Progress */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Progress</Text>
        {DIFFICULTY_BARS.map((d) => (
          <View key={d.label} style={styles.barRow}>
            <Text style={[styles.barLabel, { color: d.color }]}>{d.label}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.max((d.count / d.total) * 100, 0.5)}%`,
                    backgroundColor: d.color,
                  },
                ]}
              />
            </View>
            <Text style={styles.barCount}>{d.count}/{d.total}</Text>
          </View>
        ))}
      </View>

      {/* Daily Challenge */}
      <TouchableOpacity style={styles.challengeCard} activeOpacity={0.8}>
        <View>
          <Text style={styles.challengeLabel}>Daily Challenge</Text>
          <Text style={styles.challengeTitle}>Check today's problem</Text>
        </View>
        <Text style={styles.challengeArrow}>→</Text>
      </TouchableOpacity>

      {/* Explore */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Explore Problems</Text>
        {problemsLoading ? (
          <ActivityIndicator color="#ffa116" style={styles.problemsState} />
        ) : problemsError ? (
          <Text style={styles.problemsStateText}>
            Couldn't load problems. Pull to refresh later.
          </Text>
        ) : problems?.length ? (
          problems.map((p, i) => (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.problemRow,
                i === problems.length - 1 && styles.problemRowLast,
              ]}
              activeOpacity={0.7}
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
          <Text style={styles.problemsStateText}>No problems yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f17" },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 40 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  greeting: { fontSize: 22, fontWeight: "700", color: "#e8e8f0" },
  subGreeting: { fontSize: 14, color: "#6b6b80", marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ffa116",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#0f0f17", fontWeight: "800", fontSize: 18 },

  statsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a40",
  },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 12, color: "#6b6b80", marginTop: 4 },

  card: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2a2a40",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#e8e8f0", marginBottom: 16 },

  barRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  barLabel: { width: 52, fontSize: 13, fontWeight: "600" },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: "#2a2a40",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 3 },
  barCount: { width: 52, fontSize: 12, color: "#6b6b80", textAlign: "right" },

  challengeCard: {
    backgroundColor: "#1e1b4b",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#3730a3",
  },
  challengeLabel: { fontSize: 12, color: "#818cf8", fontWeight: "600", marginBottom: 4 },
  challengeTitle: { fontSize: 16, fontWeight: "700", color: "#e8e8f0" },
  challengeArrow: { fontSize: 22, color: "#818cf8" },

  problemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a40",
  },
  problemRowLast: { borderBottomWidth: 0 },
  problemsState: { paddingVertical: 16 },
  problemsStateText: { color: "#6b6b80", fontSize: 14, paddingVertical: 12 },
  problemLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  problemTitle: { color: "#c8c8d8", fontSize: 14, flex: 1 },
  problemDifficulty: { fontSize: 13, fontWeight: "600" },
});
