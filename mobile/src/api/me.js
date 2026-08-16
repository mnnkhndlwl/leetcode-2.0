import api from "./axiosInstance";

export async function getProblemStatus({ status, limit = 20 }) {
  const { data } = await api.get("/me/problem-status", {
    params: { status, limit },
  });
  return data; // [{ problemId, slug, title, status, solvedAt, lastAttemptedAt }]
}

export async function getMyContests() {
  const { data } = await api.get("/me/contests");
  return data; // [{ contestId, slug, title, status, startsAt, endsAt, registered }]
}

