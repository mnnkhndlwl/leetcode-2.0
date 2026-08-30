import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import CodeEditor, {
  CodeEditorSyntaxStyles,
} from "@rivascva/react-native-code-editor";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getProblem } from "../api/problems";
import { submitCode, newIdempotencyKey } from "../api/submissions";
import { useSubmissionWatcher } from "../hooks/useSubmissionWatcher";

// Labels for the codeTemplates/SUPPORTED_LANGUAGES keys.
const LANG_LABEL = {
  python3: "Python",
  javascript: "JavaScript",
  cpp: "C++",
  java: "Java",
  go: "Go",
};

// Our language key -> highlight.js language id used by the editor.
const HL_LANG = {
  python3: "python",
  javascript: "javascript",
  cpp: "cpp",
  java: "java",
  go: "go",
};

const STATUS_COLOR = {
  ACCEPTED: "#00b8a3",
  WRONG_ANSWER: "#ef4743",
  TIME_LIMIT_EXCEEDED: "#ef4743",
  MEMORY_LIMIT_EXCEEDED: "#ef4743",
  RUNTIME_ERROR: "#ef4743",
  COMPILE_ERROR: "#ef4743",
  PENDING: "#ffa116",
  RUNNING: "#ffa116",
};

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

function errorTitle(status) {
  if (status === "COMPILE_ERROR") return "Compile error";
  if (status === "RUNTIME_ERROR") return "Runtime error";
  return "Error output";
}

export default function SubmitScreen({ route }) {
  const { slug, contestId } = route.params;

  const { data: problem, isLoading, isError } = useQuery({
    queryKey: ["problem", slug],
    queryFn: () => getProblem(slug),
  });

  const [lang, setLang] = useState(null);
  const [code, setCode] = useState("");
  const { phase, result, error, watch } = useSubmissionWatcher();

  // Initialise language + starter code once the problem loads.
  useEffect(() => {
    const templates = problem?.codeTemplates;
    if (templates) {
      const keys = Object.keys(templates);
      if (keys.length) {
        setLang(keys[0]);
        setCode(templates[keys[0]] ?? "");
      }
    }
  }, [problem]);

  const submitMutation = useMutation({
    mutationFn: submitCode,
    onSuccess: (data) => watch(data.submissionId),
    onError: (e) =>
      Alert.alert("Submit failed", e.response?.data?.error ?? e.message),
  });

  function changeLang(key) {
    setLang(key);
    setCode(problem?.codeTemplates?.[key] ?? "");
  }

  function handleSubmit() {
    if (!problem || !lang) return;
    // Generate the key once per tap; React Query reuses these variables across
    // automatic retries, so a retried POST maps to the same submission.
    submitMutation.mutate({
      problemId: problem.id,
      language: lang,
      code,
      idempotencyKey: newIdempotencyKey(),
      contestId,
    });
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#ffa116" />
      </View>
    );
  }

  if (isError || !problem) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>Couldn't load this problem.</Text>
      </View>
    );
  }

  const langKeys = Object.keys(problem.codeTemplates ?? {});
  const isSubmitting = submitMutation.isPending;
  const isJudging = phase === "connecting" || phase === "watching";
  const busy = isSubmitting || isJudging;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {contestId ? (
          <View style={styles.contestBanner}>
            <Text style={styles.contestBannerText}>
              Contest submission — this counts toward your live rank
            </Text>
          </View>
        ) : null}
        <Text style={styles.title}>{problem.title}</Text>
        <View style={styles.metaRow}>
          <View style={styles.diffPill}>
            <Text style={styles.diffText}>{problem.difficulty}</Text>
          </View>
          {problem.totalSubmissions > 0 && (
            <Text style={styles.acceptRate}>
              {Math.round((problem.totalAccepted / problem.totalSubmissions) * 100)}%
              {" "}accepted · {problem.totalSubmissions} submissions
            </Text>
          )}
        </View>

        {/* Description */}
        {problem.description ? (
          <Text style={styles.description}>{problem.description}</Text>
        ) : null}

        {/* Examples */}
        {Array.isArray(problem.sampleTestCases) &&
          problem.sampleTestCases.length > 0 && (
            <View style={styles.examplesWrap}>
              {problem.sampleTestCases.map((ex, i) => (
                <View key={i} style={styles.card}>
                  <Text style={styles.exampleTitle}>Example {i + 1}</Text>
                  <Text style={styles.exampleLabel}>Input</Text>
                  <Text style={styles.exampleText} selectable>
                    {ex.input}
                  </Text>
                  <Text style={styles.exampleLabel}>Output</Text>
                  <Text style={styles.exampleText} selectable>
                    {ex.output}
                  </Text>
                  {ex.explanation ? (
                    <>
                      <Text style={styles.exampleLabel}>Explanation</Text>
                      <Text style={styles.exampleText}>{ex.explanation}</Text>
                    </>
                  ) : null}
                </View>
              ))}
            </View>
          )}

        {/* Language selector */}
        <View style={styles.langRow}>
          {langKeys.map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.langChip, lang === key && styles.langChipActive]}
              onPress={() => changeLang(key)}
              disabled={busy}
            >
              <Text
                style={[
                  styles.langChipText,
                  lang === key && styles.langChipTextActive,
                ]}
              >
                {LANG_LABEL[key] ?? key}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Code editor */}
        <View style={styles.editorWrap}>
          <CodeEditor
            key={lang}
            style={{
              fontSize: 13,
              inputLineHeight: 19,
              highlighterLineHeight: 19,
              height: 320,
            }}
            language={HL_LANG[lang] ?? "python"}
            initialValue={code}
            onChange={setCode}
            syntaxStyle={CodeEditorSyntaxStyles.atomOneDark}
            showLineNumbers
            readOnly={busy}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, busy && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={busy}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#0f0f17" />
          ) : (
            <Text style={styles.submitText}>Submit</Text>
          )}
        </TouchableOpacity>

        {/* Live status / verdict */}
        <ResultPanel phase={phase} result={result} error={error} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ResultPanel({ phase, result, error }) {
  if (phase === "connecting" || phase === "watching") {
    return (
      <View style={[styles.card, styles.row]}>
        <ActivityIndicator color="#ffa116" />
        <Text style={styles.judgingText}>
          {phase === "connecting" ? "Connecting…" : "Judging your code…"}
        </Text>
      </View>
    );
  }

  if (phase === "error") {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>{error ?? "Something went wrong"}</Text>
      </View>
    );
  }

  if (phase === "done" && result) {
    const color = STATUS_COLOR[result.status] ?? "#e8e8f0";
    return (
      <View style={styles.card}>
        <Text style={[styles.verdict, { color }]}>
          {result.status.replace(/_/g, " ")}
        </Text>
        <Text style={styles.verdictSub}>
          {result.passedCount}/{result.totalCount} test cases passed
        </Text>

        {result.runtimeMs != null && (
          <Text style={styles.metric}>Runtime: {result.runtimeMs} ms</Text>
        )}
        {result.memoryUsedMb != null && (
          <Text style={styles.metric}>Memory: {result.memoryUsedMb} MB</Text>
        )}

        {result.compileError ? (
          <View style={styles.compileBox}>
            <Text style={styles.compileTitle}>{errorTitle(result.status)}</Text>
            <Text style={styles.compileText} selectable>
              {result.compileError}
            </Text>
          </View>
        ) : null}

        {Array.isArray(result.testCaseResults) &&
          result.testCaseResults.length > 0 && (
            <View style={styles.casesWrap}>
              {result.testCaseResults.map((tc) => (
                <View key={tc.id} style={styles.caseRow}>
                  <Text style={styles.caseLabel}>Test {tc.id}</Text>
                  <Text
                    style={[
                      styles.caseStatus,
                      { color: tc.passed ? "#00b8a3" : "#ef4743" },
                    ]}
                  >
                    {tc.passed ? "Passed" : "Failed"}
                    {tc.runtimeMs != null ? `  ·  ${tc.runtimeMs} ms` : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f17" },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 48 },
  muted: { color: "#6b6b80", fontSize: 15 },

  contestBanner: {
    backgroundColor: "#1e1b4b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#3730a3",
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  contestBannerText: { color: "#818cf8", fontSize: 12, fontWeight: "700" },

  title: { fontSize: 22, fontWeight: "700", color: "#e8e8f0" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  diffPill: {
    alignSelf: "flex-start",
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#2a2a40",
  },
  diffText: { color: "#ffa116", fontSize: 12, fontWeight: "600" },
  acceptRate: { color: "#6b6b80", fontSize: 12 },

  description: {
    color: "#c8c8d8",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 16,
  },

  examplesWrap: { gap: 12, marginTop: 4 },
  exampleTitle: {
    color: "#e8e8f0",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  exampleLabel: {
    color: "#6b6b80",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
  },
  exampleText: {
    color: "#c8c8d8",
    fontFamily: MONO,
    fontSize: 13,
    marginTop: 4,
  },

  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "#2a2a40",
  },
  langChipActive: { backgroundColor: "#ffa116", borderColor: "#ffa116" },
  langChipText: { color: "#c8c8d8", fontSize: 13, fontWeight: "600" },
  langChipTextActive: { color: "#0f0f17" },

  editorWrap: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a40",
    overflow: "hidden",
  },

  submitBtn: {
    backgroundColor: "#00b8a3",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 16,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: "#0f0f17", fontWeight: "700", fontSize: 16 },

  card: {
    marginTop: 18,
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2a2a40",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  judgingText: { color: "#c8c8d8", fontSize: 15 },
  errorText: { color: "#ef4743", fontSize: 14 },

  verdict: { fontSize: 20, fontWeight: "800", letterSpacing: 0.5 },
  verdictSub: { color: "#c8c8d8", fontSize: 14, marginTop: 4 },
  metric: { color: "#6b6b80", fontSize: 13, marginTop: 6 },

  compileBox: {
    marginTop: 12,
    backgroundColor: "#11111c",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#3a2222",
  },
  compileTitle: { color: "#ef4743", fontSize: 13, fontWeight: "700", marginBottom: 6 },
  compileText: { color: "#e8b8b8", fontFamily: MONO, fontSize: 12 },

  casesWrap: { marginTop: 14, gap: 8 },
  caseRow: { flexDirection: "row", justifyContent: "space-between" },
  caseLabel: { color: "#c8c8d8", fontSize: 13 },
  caseStatus: { fontSize: 13, fontWeight: "600" },
});
