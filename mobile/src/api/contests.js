import api from "./axiosInstance";

export async function getContests() {
  const { data } = await api.get("/contests");
  return data; // [{ id? or contestId? handled by backend shape, title, slug, startsAt, endsAt, registrationStartsAt, registrationEndsAt, status }]
}

export async function getContest(slug) {
  const { data } = await api.get(`/contests/${slug}`);
  return data; // full contest object
}

export async function registerForContest(slug) {
  const res = await api.post(`/contests/${slug}/register`);
  return res.data; // { registered: true } or { registered: true, alreadyRegistered: true } or { error }
}

export async function getContestLeaderboard(slug) {
  const { data } = await api.get(`/contests/${slug}/leaderboard`);
  return data; // { status, leaderboard }
}

