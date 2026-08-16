import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
import { getContest, getContestLeaderboard } from "../api/contests";
import { getMyContests } from "../api/me";
import { registerForContest } from "../api/contests";
import { useContestWatcher } from "../hooks/useContestWatcher";

export default function ContestDetailScreen({ route, navigation }) {
  const { slug } = route.params;
  const user = useUserStore((s) => s.user);
  const { phase, leaderboard: liveTop50, rank: liveRank, error, watch } =
    useContestWatcher();

  const {
    data: contest,
    isLoading: contestLoading,
    isError: contestError,
    error: contestErrObj,
  } = useQuery({
    queryKey: ["contests", slug],
    queryFn: () => getContest(slug),
  });

  const {
    data: myContests,
    isLoading: myContestsLoading,
    isError: myContestsError,
  } = useQuery({
    queryKey: ["me", "contests", slug],
    queryFn: getMyContests,
  });

  const meContest = useMemo(() => {
    return (myContests ?? []).find((c) => c.slug === slug) ?? null;
  }, [myContests, slug]);

  const contestId = meContest?.contestId;
  const registered = meContest?.registered ?? false;

  const {
    data: leaderboardRes,
    isLoading: leaderboardLoading,
    isError: leaderboardError,
  } = useQuery({
    queryKey: ["contests", slug, "leaderboard"],
    queryFn: () => getContestLeaderboard(slug),
    enabled: !!slug,
  });

  useEffect(() => {
    if (!contest) return;
    if (contest.status !== "RUNNING") return;
    if (!contestId) return;
    watch(contestId);
  }, [contest?.status, contestId, watch]);

  const displayedLeaderboard = useMemo(() => {
    if (contest?.status === "RUNNING") {
      if (liveTop50?.length) return liveTop50;
      return leaderboardRes?.leaderboard ?? [];
    }
    return leaderboardRes?.leaderboard ?? [];
  }, [contest?.status, liveTop50, leaderboardRes]);

  const effectiveRank = useMemo(() => {
    if (!user?.id) return null;
    if (liveRank != null) return liveRank;
    const idx = (displayedLeaderboard ?? []).findIndex(
      (e) => e.userId === user.id
    );
    if (idx >= 0) return idx + 1;
    return null;
  }, [displayedLeaderboard, liveRank, user?.id]);

  if (contestLoading || myContestsLoading || leaderboardLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#ffa116" />
      </View>
    );
  }

  if (contestError || myContestsError || leaderboardError || !contest) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>
          Couldn't load contest details.
          {contestErrObj?.response?.data?.error
            ? ` ${contestErrObj.response.data.error}`
            : ""}
        </Text>
      </View>
    );
  }

  const leaderboardTitle =
    contest.status === "RUNNING" ? "Live Leaderboard (Top 50)" : "Final Leaderboard";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{contest.title}</Text>
        <Text style={styles.meta}>
          Status: <Text style={{ color: STATUS_COLOR(contest.status) }}>{contest.status}</Text>
        </Text>
      </View>

      {registered ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>You are registered for this contest.</Text>
        </View>
      ) : (
        <RegisterCTA
          slug={slug}
          onRegistered={() => {
            // Simple refresh: invalidate in RN later if needed
            navigation.replace("ContestDetail", { slug, title: contest.title });
          }}
        />
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>Your rank: {effectiveRank ?? "--"}</Text>
      </View>

      <Text style={styles.sectionTitle}>{leaderboardTitle}</Text>

      <View style={styles.tableHeader}>
        <Text style={[styles.col, styles.colRank]}>#</Text>
        <Text style={[styles.col, styles.colUser]}>Player</Text>
        {contest.status === "RUNNING" ? (
          <>
            <Text style={[styles.col, styles.colStat]}>Solved</Text>
            <Text style={[styles.col, styles.colStat]}>Penalty</Text>
          </>
        ) : (
          <>
            <Text style={[styles.col, styles.colStat]}>Score</Text>
            <Text style={[styles.col, styles.colStat]}>Penalty</Text>
          </>
        )}
      </View>

      {(displayedLeaderboard ?? []).slice(0, 50).map((row, i) => {
        const rank = row.rank ?? i + 1;
        const username = row.username ?? "Player";
        const solved = row.solvedCount ?? null;
        const score = row.totalScore ?? null;
        const penalty = row.totalPenalty ?? 0;
        return (
          <View key={`${row.userId}-${rank}`} style={styles.row}>
            <Text style={[styles.col, styles.colRank]}>{rank}</Text>
            <Text style={[styles.col, styles.colUser]} numberOfLines={1}>
              {username}
            </Text>
            {contest.status === "RUNNING" ? (
              <>
                <Text style={[styles.col, styles.colStat]}>{solved ?? 0}</Text>
                <Text style={[styles.col, styles.colStat]}>{penalty ?? 0}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.col, styles.colStat]}>{score ?? 0}</Text>
                <Text style={[styles.col, styles.colStat]}>{penalty ?? 0}</Text>
              </>
            )}
          </View>
        );
      })}

      {contest.status === "RUNNING" ? (
        <View style={styles.liveNote}>
          <Text style={styles.liveNoteText}>
            {phase === "connecting"
              ? "Connecting to live updates…"
              : phase === "error"
              ? error ?? "Live updates error"
              : "Live updates enabled"}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const STATUS_COLOR = (status) => {
  if (status === "RUNNING") return "#ffa116";
  if (status === "FINISHED") return "#00b8a3";
  return "#6b6b80";
};

function RegisterCTA({ slug, onRegistered }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const mutation = useMutation({
    mutationFn: () => registerForContest(slug),
    onSuccess: () => {
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: ["me", "contests"] });
      onRegistered?.();
    },
    onError: (e) => {
      setBusy(false);
      Alert.alert(
        "Registration failed",
        e?.response?.data?.error ?? e.message ?? "Unknown error"
      );
    },
  });

  return (
    <TouchableOpacity
      style={styles.primaryBtn}
      disabled={busy || mutation.isPending}
      onPress={() => {
        setBusy(true);
        mutation.mutate();
      }}
    >
      <Text style={styles.primaryBtnText}>Register</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f17" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  center: { justifyContent: "center" },

  header: { marginBottom: 14 },
  title: { fontSize: 26, fontWeight: "800", color: "#e8e8f0" },
  meta: { marginTop: 6, color: "#6b6b80", fontSize: 13 },

  infoBox: {
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a2a40",
    padding: 14,
    marginBottom: 12,
  },
  infoText: { color: "#e8e8f0", fontWeight: "600" },

  sectionTitle: { marginTop: 12, marginBottom: 10, color: "#e8e8f0", fontSize: 16, fontWeight: "800" },

  primaryBtn: {
    backgroundColor: "#ffa116",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryBtnText: { color: "#0f0f17", fontWeight: "900", fontSize: 15 },

  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "#2a2a40",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#121225",
    borderWidth: 1,
    borderColor: "#1f1f35",
    marginBottom: 8,
  },
  col: { color: "#e8e8f0", fontWeight: "700", fontSize: 13 },
  colRank: { width: 26 },
  colUser: { flex: 1 },
  colStat: { width: 70, textAlign: "right" },

  liveNote: { marginTop: 8, alignItems: "center" },
  liveNoteText: { color: "#6b6b80", fontSize: 12 },
});

