import "@dotenvx/dotenvx/config";
import { Pool } from "pg";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const rows = (await pool.query(`select slug, "driverCode" from problems`)).rows;
await pool.end();
const driverFor = {};
for (const r of rows) driverFor[r.slug] = r.driverCode.javascript;

// Reference solutions (correct) — concatenated before the real JS driver,
// run as a child process so expectedOutput == exactly what the driver prints.
const REF = {
  "valid-parentheses": `var isValid = function(s) {
  const st = []; const m = { ')':'(', ']':'[', '}':'{' };
  for (const c of s) { if (c==='('||c==='['||c==='{') st.push(c); else if (st.pop() !== m[c]) return false; }
  return st.length === 0;
};`,
  "palindrome-number": `var isPalindrome = function(x) {
  if (x < 0) return false; const s = String(x); return s === s.split('').reverse().join('');
};`,
  "climbing-stairs": `var climbStairs = function(n) {
  let a = 1, b = 1; for (let i = 0; i < n; i++) { const t = a + b; a = b; b = t; } return a;
};`,
  "reverse-linked-list": `var reverseList = function(head) {
  let prev = null; while (head) { const nx = head.next; head.next = prev; prev = head; head = nx; } return prev;
};`,
  "longest-substring-without-repeating-characters": `var lengthOfLongestSubstring = function(s) {
  const seen = new Map(); let start = 0, best = 0;
  for (let i = 0; i < s.length; i++) { const c = s[i]; if (seen.has(c) && seen.get(c) >= start) start = seen.get(c)+1; seen.set(c,i); best = Math.max(best, i-start+1); }
  return best;
};`,
  "add-two-numbers": `var addTwoNumbers = function(l1, l2) {
  const dummy = new ListNode(0); let cur = dummy, carry = 0;
  while (l1 || l2 || carry) { const s = (l1?l1.val:0)+(l2?l2.val:0)+carry; carry = Math.floor(s/10); cur.next = new ListNode(s%10); cur = cur.next; if (l1) l1 = l1.next; if (l2) l2 = l2.next; }
  return dummy.next;
};`,
  "container-with-most-water": `var maxArea = function(height) {
  let l = 0, r = height.length-1, best = 0;
  while (l < r) { best = Math.max(best, Math.min(height[l],height[r])*(r-l)); if (height[l] < height[r]) l++; else r--; }
  return best;
};`,
  "three-sum": `var threeSum = function(nums) {
  nums.sort((a,b)=>a-b); const res = [];
  for (let i = 0; i < nums.length-2; i++) { if (i>0 && nums[i]===nums[i-1]) continue; let l=i+1, r=nums.length-1;
    while (l<r) { const s = nums[i]+nums[l]+nums[r]; if (s===0){ res.push([nums[i],nums[l],nums[r]]); while(l<r&&nums[l]===nums[l+1])l++; while(l<r&&nums[r]===nums[r-1])r--; l++; r--; } else if (s<0) l++; else r--; } }
  return res;
};`,
  "median-of-two-sorted-arrays": `var findMedianSortedArrays = function(nums1, nums2) {
  const m = nums1.concat(nums2).sort((a,b)=>a-b); const n = m.length;
  return n % 2 ? m[(n-1)/2] : (m[n/2-1] + m[n/2]) / 2;
};`,
  "trapping-rain-water": `var trap = function(height) {
  let l = 0, r = height.length-1, lm = 0, rm = 0, res = 0;
  while (l < r) { if (height[l] < height[r]) { lm = Math.max(lm, height[l]); res += lm - height[l]; l++; } else { rm = Math.max(rm, height[r]); res += rm - height[r]; r--; } }
  return res;
};`,
  "word-break-ii": `var wordBreak = function(s, wordDict) {
  const words = new Set(wordDict); const memo = new Map();
  const dfs = (i) => { if (i === s.length) return ['']; if (memo.has(i)) return memo.get(i); const res = [];
    for (let j = i+1; j <= s.length; j++) { const w = s.slice(i,j); if (words.has(w)) for (const rest of dfs(j)) res.push(rest === '' ? w : w + ' ' + rest); }
    memo.set(i, res); return res; };
  return dfs(0);
};`,
};

// Inputs (stdin strings) + per-case explanation builder.
const INPUTS = {
  "valid-parentheses": {
    cases: ["()", "()[]{}", "(]", "([)]", "{[]}", "(", "]", "((()))", "((", "([{}])", "){"],
    expl: (i, o) => `s = "${i}" -> ${o}`,
  },
  "palindrome-number": {
    cases: ["121", "-121", "10", "0", "7", "1221", "12321", "100", "-1", "1234321", "2147483647"],
    expl: (i, o) => `${i} is${o === "true" ? "" : " not"} a palindrome`,
  },
  "climbing-stairs": {
    cases: ["1", "2", "3", "4", "5", "10", "20", "30", "45"],
    expl: (i, o) => `n = ${i} -> ${o} distinct ways`,
  },
  "reverse-linked-list": {
    cases: ["1 2 3 4 5", "1 2", "", "1", "5 4 3 2 1", "-5 0 5", "1 1 2 2", "3 7 9 1 4 6"],
    expl: (i, o) => `[${i.split(/\s+/).filter(Boolean).join(",")}] reversed -> [${o.split(/\s+/).filter(Boolean).join(",")}]`,
  },
  "longest-substring-without-repeating-characters": {
    cases: ["abcabcbb", "bbbbb", "pwwkew", "", "abcdef", "dvdf", " ", "au", "tmmzuxt", "abba"],
    expl: (i, o) => `s = "${i}" -> longest length ${o}`,
  },
  "add-two-numbers": {
    cases: ["2 4 3\n5 6 4", "0\n0", "9 9 9 9 9 9 9\n9 9 9 9", "1\n9 9", "5\n5", "1 8\n0 1", "9 9\n1"],
    expl: (i, o) => {
      const [a, b] = i.split("\n");
      return `[${a.split(/\s+/).join(",")}] + [${b.split(/\s+/).join(",")}] = [${o.split(/\s+/).filter(Boolean).join(",")}]`;
    },
  },
  "container-with-most-water": {
    cases: ["9\n1 8 6 2 5 4 8 3 7", "2\n1 1", "5\n1 2 3 4 5", "6\n1 2 4 3 5 2", "4\n2 3 4 5", "3\n0 0 0"],
    expl: (i, o) => `max water = ${o}`,
  },
  "three-sum": {
    cases: ["6\n-1 0 1 2 -1 -4", "3\n0 1 1", "3\n0 0 0", "6\n-2 0 1 1 2 -1", "5\n-1 0 1 2 -4", "1\n0", "7\n-4 -2 -2 0 2 2 4"],
    expl: (i, o) => `${o === "" ? "no triplets sum to 0" : (o.split("\n").length + " triplet(s) summing to 0")}`,
  },
  "median-of-two-sorted-arrays": {
    cases: ["2\n1 3\n1\n2", "2\n1 2\n2\n3 4", "0\n\n1\n1", "1\n1\n1\n3", "3\n1 2 3\n3\n4 5 6", "4\n1 2 3 4\n0\n", "1\n5\n2\n1 9"],
    expl: (i, o) => `median = ${o}`,
  },
  "trapping-rain-water": {
    cases: ["12\n0 1 0 2 1 0 1 3 2 1 2 1", "6\n4 2 0 3 2 5", "1\n5", "3\n0 0 0", "5\n5 4 3 2 1", "5\n1 2 3 4 5", "6\n3 0 2 0 4 0"],
    expl: (i, o) => `${o} units of water trapped`,
  },
  "word-break-ii": {
    cases: [
      "catsanddog\ncat cats and sand dog",
      "pineapplepenapple\napple pen applepen pine pineapple",
      "catsandog\ncats dog sand and cat",
      "aaa\na aa",
    ],
    expl: (i, o) => `${o === "" ? "no valid segmentation" : (o.split("\n").length + " valid segmentation(s)")}`,
  },
};

function runCase(slug, input) {
  const file = join(process.cwd(), "_run.cjs");
  writeFileSync(file, REF[slug] + "\n\n" + driverFor[slug]);
  return execSync("node _run.cjs", { input }).toString().replace(/\r/g, "").replace(/\s+$/, "");
}

const summary = [];
for (const slug of Object.keys(INPUTS)) {
  const { cases, expl } = INPUTS[slug];
  const out = cases.map((input, idx) => {
    const expectedOutput = runCase(slug, input);
    return { id: idx + 1, input, expectedOutput, explanation: expl(input, expectedOutput) };
  });
  const dir = join(process.cwd(), "test-cases", slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cases.json"), JSON.stringify(out, null, 2) + "\n");
  summary.push(`${slug}: ${out.length} cases`);
  console.log(`\n=== ${slug} ===`);
  for (const c of out) console.log(`  in=${JSON.stringify(c.input)} -> out=${JSON.stringify(c.expectedOutput)}`);
}
console.log("\n" + summary.join("\n"));
