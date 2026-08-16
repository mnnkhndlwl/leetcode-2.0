import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";

import useUserStore from "../store/useUserStore";
import { getMyContests } from "../api/me";
import { registerForContest } from "../api/contests";

const STATUS_COLOR = {
  DRAFT: "#6b6b80",
  RUNNING: "#ffa116",
  FINISHED: "#00b8a3",
};

export default function ContestsScreen({ navigation }) {
  const queryClient = useQueryClient();
  const user = useUserStore((s) => s.user);

  const {
    data: contests,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["me", "contests"],
    queryFn: getMyContests,
  });

  const registerMutation = useMutation({
    mutationFn: registerForContest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me", "contests"] });
    },
    onError: (e) => {
      Alert.alert(
        "Registration failed",
        e?.response?.data?.error ?? e.message ?? "Unknown error"
      );
    },
  });

  const list = useMemo(() => contests ?? [], [contests]);

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
        <Text style={styles.muted}>
          Couldn't load contests.{" "}
          {error?.response?.data?.error ?? ""}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Contests</Text>
      <Text style={styles.subtitle}>
        {user?.username ? `${user.username}:` : "Your:"} join and compete
      </Text>

      {list.length === 0 ? (
        <Text style={styles.muted}>No contests found.</Text>
      ) : (
        list
          .slice()
          .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""))
          .map((c) => (
            <View key={c.contestId} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {c.title}
                  </Text>
                  <Text style={styles.cardMeta}>
                    Status:{" "}
                    <Text style={{ color: STATUS_COLOR[c.status] ?? "#ffa116" }}>
                      {c.status}
                    </Text>
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.detailBtn}
                  onPress={() =>
                    navigation.navigate("ContestDetail", { slug: c.slug, title: c.title })
                  }
                >
                  <Text style={styles.detailBtnText}>View</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  c.registered && styles.primaryBtnDisabled,
                ]}
                disabled={c.registered || registerMutation.isPending}
                onPress={() => registerMutation.mutate(c.slug)}
              >
                <Text style={styles.primaryBtnText}>
                  {c.registered ? "Registered" : "Register"}
                </Text>
              </TouchableOpacity>
            </View>
          ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f17" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  center: { justifyContent: "center" },

  title: { fontSize: 28, fontWeight: "800", color: "#e8e8f0", marginBottom: 2 },
  subtitle: { color: "#6b6b80", fontSize: 14, marginBottom: 18 },

  muted: { color: "#6b6b80", fontSize: 14 },

  card: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2a2a40",
    marginBottom: 12,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  cardTitle: { color: "#e8e8f0", fontWeight: "700", fontSize: 16 },
  cardMeta: { color: "#6b6b80", fontSize: 13, marginTop: 6 },

  detailBtn: {
    backgroundColor: "#2a2a40",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  detailBtnText: { color: "#e8e8f0", fontWeight: "700", fontSize: 13 },

  primaryBtn: {
    backgroundColor: "#ffa116",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: { color: "#0f0f17", fontWeight: "800", fontSize: 15 },
});

