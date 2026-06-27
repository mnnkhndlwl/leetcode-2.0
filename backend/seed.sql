-- =============================================================
-- SEED: tags + problems + problemTags
-- Run: psql $DATABASE_URL -f seed.sql
-- Safe to re-run: uses ON CONFLICT DO NOTHING
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- TAGS
-- -------------------------------------------------------------
INSERT INTO tags (id, name, slug, "createdAt", "updatedAt") VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Array',                'array',                NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000002', 'Hash Table',           'hash-table',           NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000003', 'String',               'string',               NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000004', 'Stack',                'stack',                NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000005', 'Math',                 'math',                 NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000006', 'Dynamic Programming',  'dynamic-programming',  NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000007', 'Linked List',          'linked-list',          NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000008', 'Two Pointers',         'two-pointers',         NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000009', 'Sliding Window',       'sliding-window',       NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000010', 'Greedy',               'greedy',               NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000011', 'Sorting',              'sorting',              NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000012', 'Binary Search',        'binary-search',        NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000013', 'Divide and Conquer',   'divide-and-conquer',   NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000014', 'Backtracking',         'backtracking',         NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000015', 'Recursion',            'recursion',            NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------
-- PROBLEMS
-- -------------------------------------------------------------
INSERT INTO problems (
  id, title, description, difficulty, slug, visibility,
  "timeLimitMs", "memoryLimitMb",
  "sampleTestCases",
  "totalSubmissions", "totalAccepted",
  "createdAt", "updatedAt"
) VALUES

-- ── EASY ─────────────────────────────────────────────────────

(
  'b1000000-0000-0000-0000-000000000001',
  'Two Sum',
  'Given an array of integers `nums` and an integer `target`, return *indices* of the two numbers such that they add up to `target`.

You may assume that each input would have **exactly one solution**, and you may not use the same element twice.

You can return the answer in any order.

**Constraints:**
- `2 <= nums.length <= 10^4`
- `-10^9 <= nums[i] <= 10^9`
- `-10^9 <= target <= 10^9`
- Only one valid answer exists.',
  'Easy',
  'two-sum',
  'PUBLIC', 2000, 256,
  '[
    {"input": "nums = [2,7,11,15], target = 9",  "output": "[0,1]",  "explanation": "Because nums[0] + nums[1] == 9, we return [0, 1]."},
    {"input": "nums = [3,2,4], target = 6",       "output": "[1,2]",  "explanation": "Because nums[1] + nums[2] == 6, we return [1, 2]."},
    {"input": "nums = [3,3], target = 6",          "output": "[0,1]",  "explanation": "Because nums[0] + nums[1] == 6, we return [0, 1]."}
  ]'::jsonb,
  0, 0, NOW(), NOW()
),

(
  'b1000000-0000-0000-0000-000000000002',
  'Valid Parentheses',
  'Given a string `s` containing just the characters `(`, `)`, `{`, `}`, `[` and `]`, determine if the input string is valid.

An input string is valid if:
1. Open brackets must be closed by the same type of brackets.
2. Open brackets must be closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.

**Constraints:**
- `1 <= s.length <= 10^4`
- `s` consists of parentheses only `()[]{}`.
',
  'Easy',
  'valid-parentheses',
  'PUBLIC', 2000, 256,
  '[
    {"input": "s = \"()\"",       "output": "true",  "explanation": "The string contains a single valid pair."},
    {"input": "s = \"()[]{}\"",   "output": "true",  "explanation": "All bracket pairs are correctly matched."},
    {"input": "s = \"(]\"",       "output": "false", "explanation": "The closing bracket does not match the opening bracket type."}
  ]'::jsonb,
  0, 0, NOW(), NOW()
),

(
  'b1000000-0000-0000-0000-000000000003',
  'Palindrome Number',
  'Given an integer `x`, return `true` if `x` is a **palindrome**, and `false` otherwise.

An integer is a palindrome when it reads the same forward and backward. For example, `121` is a palindrome while `123` is not.

**Follow up:** Could you solve it without converting the integer to a string?

**Constraints:**
- `-2^31 <= x <= 2^31 - 1`
',
  'Easy',
  'palindrome-number',
  'PUBLIC', 2000, 256,
  '[
    {"input": "x = 121",  "output": "true",  "explanation": "121 reads as 121 from left to right and from right to left."},
    {"input": "x = -121", "output": "false", "explanation": "From left to right, it reads -121. From right to left, it becomes 121-. Therefore it is not a palindrome."},
    {"input": "x = 10",   "output": "false", "explanation": "Reads 01 from right to left. Therefore it is not a palindrome."}
  ]'::jsonb,
  0, 0, NOW(), NOW()
),

(
  'b1000000-0000-0000-0000-000000000004',
  'Climbing Stairs',
  'You are climbing a staircase. It takes `n` steps to reach the top.

Each time you can either climb `1` or `2` steps. In how many distinct ways can you climb to the top?

**Constraints:**
- `1 <= n <= 45`
',
  'Easy',
  'climbing-stairs',
  'PUBLIC', 2000, 256,
  '[
    {"input": "n = 2", "output": "2",  "explanation": "There are two ways to climb to the top: (1 step + 1 step) or (2 steps)."},
    {"input": "n = 3", "output": "3",  "explanation": "There are three ways: (1+1+1), (1+2), (2+1)."}
  ]'::jsonb,
  0, 0, NOW(), NOW()
),

(
  'b1000000-0000-0000-0000-000000000005',
  'Reverse Linked List',
  'Given the `head` of a singly linked list, reverse the list, and return *the reversed list*.

**Constraints:**
- The number of nodes in the list is the range `[0, 5000]`.
- `-5000 <= Node.val <= 5000`

**Follow up:** A linked list can be reversed either iteratively or recursively. Could you implement both?
',
  'Easy',
  'reverse-linked-list',
  'PUBLIC', 2000, 256,
  '[
    {"input": "head = [1,2,3,4,5]", "output": "[5,4,3,2,1]", "explanation": "The list is reversed in place."},
    {"input": "head = [1,2]",        "output": "[2,1]",        "explanation": "Two-node list reversed."},
    {"input": "head = []",           "output": "[]",           "explanation": "Empty list remains empty."}
  ]'::jsonb,
  0, 0, NOW(), NOW()
),

-- ── MEDIUM ───────────────────────────────────────────────────

(
  'b1000000-0000-0000-0000-000000000006',
  'Longest Substring Without Repeating Characters',
  'Given a string `s`, find the length of the **longest substring** without duplicate characters.

**Constraints:**
- `0 <= s.length <= 5 * 10^4`
- `s` consists of English letters, digits, symbols and spaces.
',
  'Medium',
  'longest-substring-without-repeating-characters',
  'PUBLIC', 2000, 256,
  '[
    {"input": "s = \"abcabcbb\"", "output": "3", "explanation": "The answer is \"abc\", with the length of 3."},
    {"input": "s = \"bbbbb\"",    "output": "1", "explanation": "The answer is \"b\", with the length of 1."},
    {"input": "s = \"pwwkew\"",   "output": "3", "explanation": "The answer is \"wke\", with the length of 3."}
  ]'::jsonb,
  0, 0, NOW(), NOW()
),

(
  'b1000000-0000-0000-0000-000000000007',
  'Add Two Numbers',
  'You are given two **non-empty** linked lists representing two non-negative integers. The digits are stored in **reverse order**, and each of their nodes contains a single digit. Add the two numbers and return the sum as a linked list.

You may assume the two numbers do not contain any leading zero, except the number 0 itself.

**Constraints:**
- The number of nodes in each linked list is in the range `[1, 100]`.
- `0 <= Node.val <= 9`
- It is guaranteed that the list represents a number that does not have leading zeros.
',
  'Medium',
  'add-two-numbers',
  'PUBLIC', 2000, 256,
  '[
    {"input": "l1 = [2,4,3], l2 = [5,6,4]", "output": "[7,0,8]",     "explanation": "342 + 465 = 807."},
    {"input": "l1 = [0], l2 = [0]",          "output": "[0]",         "explanation": "0 + 0 = 0."},
    {"input": "l1 = [9,9,9,9,9,9,9], l2 = [9,9,9,9]", "output": "[8,9,9,9,0,0,0,1]", "explanation": "9999999 + 9999 = 10009998."}
  ]'::jsonb,
  0, 0, NOW(), NOW()
),

(
  'b1000000-0000-0000-0000-000000000008',
  'Container With Most Water',
  'You are given an integer array `height` of length `n`. There are `n` vertical lines drawn such that the two endpoints of the `i`th line are `(i, 0)` and `(i, height[i])`.

Find two lines that together with the x-axis form a container, such that the container contains the most water.

Return *the maximum amount of water a container can store*.

**Notice** that you may not slant the container.

**Constraints:**
- `n == height.length`
- `2 <= n <= 10^5`
- `0 <= height[i] <= 10^4`
',
  'Medium',
  'container-with-most-water',
  'PUBLIC', 2000, 256,
  '[
    {"input": "height = [1,8,6,2,5,4,8,3,7]", "output": "49", "explanation": "The above vertical lines are represented by array [1,8,6,2,5,4,8,3,7]. In this case, the max area of water the container can contain is 49."},
    {"input": "height = [1,1]",                "output": "1",  "explanation": "Only one container possible with area 1."}
  ]'::jsonb,
  0, 0, NOW(), NOW()
),

(
  'b1000000-0000-0000-0000-000000000009',
  '3Sum',
  'Given an integer array `nums`, return all the triplets `[nums[i], nums[j], nums[k]]` such that `i != j`, `i != k`, and `j != k`, and `nums[i] + nums[j] + nums[k] == 0`.

Notice that the solution set must not contain duplicate triplets.

**Constraints:**
- `3 <= nums.length <= 3000`
- `-10^5 <= nums[i] <= 10^5`
',
  'Medium',
  'three-sum',
  'PUBLIC', 2000, 256,
  '[
    {"input": "nums = [-1,0,1,2,-1,-4]", "output": "[[-1,-1,2],[-1,0,1]]", "explanation": "nums[0] + nums[1] + nums[2] = (-1) + 0 + 1 = 0. nums[1] + nums[2] + nums[4] = 0 + 1 + (-1) = 0. nums[0] + nums[3] + nums[4] = (-1) + 2 + (-1) = 0."},
    {"input": "nums = [0,1,1]",          "output": "[]",                   "explanation": "The only possible triplet does not sum up to 0."},
    {"input": "nums = [0,0,0]",          "output": "[[0,0,0]]",            "explanation": "The only possible triplet sums up to 0."}
  ]'::jsonb,
  0, 0, NOW(), NOW()
),

-- ── HARD ─────────────────────────────────────────────────────

(
  'b1000000-0000-0000-0000-000000000010',
  'Median of Two Sorted Arrays',
  'Given two sorted arrays `nums1` and `nums2` of size `m` and `n` respectively, return **the median** of the two sorted arrays.

The overall run time complexity should be `O(log (m+n))`.

**Constraints:**
- `nums1.length == m`
- `nums2.length == n`
- `0 <= m <= 1000`
- `0 <= n <= 1000`
- `1 <= m + n <= 2000`
- `-10^6 <= nums1[i], nums2[i] <= 10^6`
',
  'Hard',
  'median-of-two-sorted-arrays',
  'PUBLIC', 2000, 256,
  '[
    {"input": "nums1 = [1,3], nums2 = [2]",       "output": "2.00000", "explanation": "merged array = [1,2,3] and median is 2."},
    {"input": "nums1 = [1,2], nums2 = [3,4]",     "output": "2.50000", "explanation": "merged array = [1,2,3,4] and median is (2 + 3) / 2 = 2.5."}
  ]'::jsonb,
  0, 0, NOW(), NOW()
),

(
  'b1000000-0000-0000-0000-000000000011',
  'Trapping Rain Water',
  'Given `n` non-negative integers representing an elevation map where the width of each bar is `1`, compute how much water it can trap after raining.

**Constraints:**
- `n == height.length`
- `1 <= n <= 2 * 10^4`
- `0 <= height[i] <= 10^5`
',
  'Hard',
  'trapping-rain-water',
  'PUBLIC', 2000, 256,
  '[
    {"input": "height = [0,1,0,2,1,0,1,3,2,1,2,1]", "output": "6", "explanation": "The elevation map (black section) is represented by array [0,1,0,2,1,0,1,3,2,1,2,1]. In this case, 6 units of rain water are being trapped."},
    {"input": "height = [4,2,0,3,2,5]",              "output": "9", "explanation": "9 units of rain water are trapped."}
  ]'::jsonb,
  0, 0, NOW(), NOW()
),

(
  'b1000000-0000-0000-0000-000000000012',
  'Word Break II',
  'Given a string `s` and a dictionary of strings `wordDict`, add spaces in `s` to construct a sentence where each word is a valid dictionary word. Return *all such possible sentences* in **any order**.

**Note** that the same word in the dictionary may be reused multiple times in the segmentation.

**Constraints:**
- `1 <= s.length <= 20`
- `1 <= wordDict.length <= 1000`
- `1 <= wordDict[i].length <= 10`
- `s` and `wordDict[i]` consist of only lowercase English letters.
- All the strings of `wordDict` are **unique**.
- Input is generated in a way that the length of the answer doesn''t exceed 10^5.
',
  'Hard',
  'word-break-ii',
  'PUBLIC', 2000, 256,
  '[
    {"input": "s = \"catsanddog\", wordDict = [\"cat\",\"cats\",\"and\",\"sand\",\"dog\"]", "output": "[\"cats and dog\",\"cat sand dog\"]", "explanation": "Both sentences are valid decompositions."},
    {"input": "s = \"pineapplepenapple\", wordDict = [\"apple\",\"pen\",\"applepen\",\"pine\",\"pineapple\"]", "output": "[\"pine apple pen apple\",\"pineapple pen apple\",\"pine applepen apple\"]", "explanation": "Three valid decompositions exist."},
    {"input": "s = \"catsandog\", wordDict = [\"cats\",\"dog\",\"sand\",\"and\",\"cat\"]", "output": "[]", "explanation": "No valid decomposition exists."}
  ]'::jsonb,
  0, 0, NOW(), NOW()
)

ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------
-- PROBLEM  ↔  TAG  RELATIONS
-- -------------------------------------------------------------
INSERT INTO "problemTags" ("problemId", "tagId") VALUES

-- Two Sum → Array, Hash Table
('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002'),

-- Valid Parentheses → String, Stack
('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003'),
('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004'),

-- Palindrome Number → Math
('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000005'),

-- Climbing Stairs → Dynamic Programming, Math
('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000006'),
('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000005'),

-- Reverse Linked List → Linked List, Recursion
('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000007'),
('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000015'),

-- Longest Substring → String, Sliding Window, Hash Table
('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000003'),
('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000009'),
('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000002'),

-- Add Two Numbers → Linked List, Math, Recursion
('b1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000007'),
('b1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000005'),
('b1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000015'),

-- Container With Most Water → Array, Two Pointers, Greedy
('b1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000001'),
('b1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000008'),
('b1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000010'),

-- 3Sum → Array, Two Pointers, Sorting
('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000001'),
('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000008'),
('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000011'),

-- Median of Two Sorted Arrays → Array, Binary Search, Divide and Conquer
('b1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001'),
('b1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000012'),
('b1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000013'),

-- Trapping Rain Water → Array, Two Pointers, Dynamic Programming, Stack
('b1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001'),
('b1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000008'),
('b1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000006'),
('b1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000004'),

-- Word Break II → String, Dynamic Programming, Backtracking
('b1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000003'),
('b1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000006'),
('b1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000014')

ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================
-- CODE TEMPLATES + DRIVER CODE  (python3, javascript, cpp)
-- =============================================================
-- codeTemplates : starter stub shown in the editor (function-only).
-- driverCode    : hidden harness appended after the user's code.
--                 Reads the test case from stdin, calls the user's
--                 function, prints the result to stdout. The judge
--                 compares trimmed stdout to the expected output.
--
-- Idempotent: plain UPDATEs keyed by slug — safe to re-run.
-- See the bottom of this file / chat for the full stdin/stdout
-- contract each driver expects.
-- =============================================================

BEGIN;

-- ── Two Sum ──────────────────────────────────────────────────
-- in : line1=n | line2=n ints (nums) | line3=target
-- out: "i j"
UPDATE problems SET
  "codeTemplates" = jsonb_build_object(
    'python3', $PY$class Solution:
    def twoSum(self, nums, target):
        # Write your code here
        pass$PY$,
    'javascript', $JS$var twoSum = function(nums, target) {
    // Write your code here
};$JS$,
    'cpp', $CPP$#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        // Write your code here
    }
};$CPP$
  ),
  "driverCode" = jsonb_build_object(
    'python3', $PY$import sys

def _main():
    data = sys.stdin.read().split()
    n = int(data[0])
    nums = [int(x) for x in data[1:1 + n]]
    target = int(data[1 + n])
    res = Solution().twoSum(nums, target)
    print(res[0], res[1])

_main()$PY$,
    'javascript', $JS$const _d = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean).map(Number);
const _n = _d[0];
const _nums = _d.slice(1, 1 + _n);
const _target = _d[1 + _n];
const _res = twoSum(_nums, _target);
console.log(_res[0] + " " + _res[1]);$JS$,
    'cpp', $CPP$int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<int> nums(n);
    for (int i = 0; i < n; i++) cin >> nums[i];
    int target; cin >> target;
    vector<int> res = Solution().twoSum(nums, target);
    cout << res[0] << " " << res[1] << endl;
    return 0;
}$CPP$
  ),
  "updatedAt" = NOW()
WHERE slug = 'two-sum';

-- ── Valid Parentheses ────────────────────────────────────────
-- in : line1=s
-- out: "true" | "false"
UPDATE problems SET
  "codeTemplates" = jsonb_build_object(
    'python3', $PY$class Solution:
    def isValid(self, s):
        # Write your code here
        pass$PY$,
    'javascript', $JS$var isValid = function(s) {
    // Write your code here
};$JS$,
    'cpp', $CPP$#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    bool isValid(string s) {
        // Write your code here
    }
};$CPP$
  ),
  "driverCode" = jsonb_build_object(
    'python3', $PY$import sys

def _main():
    s = sys.stdin.readline().rstrip("\n").rstrip("\r")
    print("true" if Solution().isValid(s) else "false")

_main()$PY$,
    'javascript', $JS$const _s = require('fs').readFileSync(0, 'utf8').split('\n')[0].replace(/\r$/, '');
console.log(isValid(_s) ? "true" : "false");$JS$,
    'cpp', $CPP$int main() {
    string s;
    getline(cin, s);
    cout << (Solution().isValid(s) ? "true" : "false") << endl;
    return 0;
}$CPP$
  ),
  "updatedAt" = NOW()
WHERE slug = 'valid-parentheses';

-- ── Palindrome Number ────────────────────────────────────────
-- in : line1=x
-- out: "true" | "false"
UPDATE problems SET
  "codeTemplates" = jsonb_build_object(
    'python3', $PY$class Solution:
    def isPalindrome(self, x):
        # Write your code here
        pass$PY$,
    'javascript', $JS$var isPalindrome = function(x) {
    // Write your code here
};$JS$,
    'cpp', $CPP$#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    bool isPalindrome(int x) {
        // Write your code here
    }
};$CPP$
  ),
  "driverCode" = jsonb_build_object(
    'python3', $PY$import sys

def _main():
    x = int(sys.stdin.read().split()[0])
    print("true" if Solution().isPalindrome(x) else "false")

_main()$PY$,
    'javascript', $JS$const _x = parseInt(require('fs').readFileSync(0, 'utf8').trim(), 10);
console.log(isPalindrome(_x) ? "true" : "false");$JS$,
    'cpp', $CPP$int main() {
    int x; cin >> x;
    cout << (Solution().isPalindrome(x) ? "true" : "false") << endl;
    return 0;
}$CPP$
  ),
  "updatedAt" = NOW()
WHERE slug = 'palindrome-number';

-- ── Climbing Stairs ──────────────────────────────────────────
-- in : line1=n
-- out: integer
UPDATE problems SET
  "codeTemplates" = jsonb_build_object(
    'python3', $PY$class Solution:
    def climbStairs(self, n):
        # Write your code here
        pass$PY$,
    'javascript', $JS$var climbStairs = function(n) {
    // Write your code here
};$JS$,
    'cpp', $CPP$#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int climbStairs(int n) {
        // Write your code here
    }
};$CPP$
  ),
  "driverCode" = jsonb_build_object(
    'python3', $PY$import sys

def _main():
    n = int(sys.stdin.read().split()[0])
    print(Solution().climbStairs(n))

_main()$PY$,
    'javascript', $JS$const _n = parseInt(require('fs').readFileSync(0, 'utf8').trim(), 10);
console.log(climbStairs(_n));$JS$,
    'cpp', $CPP$int main() {
    int n; cin >> n;
    cout << Solution().climbStairs(n) << endl;
    return 0;
}$CPP$
  ),
  "updatedAt" = NOW()
WHERE slug = 'climbing-stairs';

-- ── Reverse Linked List ──────────────────────────────────────
-- in : line1=space-separated node values (empty line => empty list)
-- out: space-separated values of the reversed list
UPDATE problems SET
  "codeTemplates" = jsonb_build_object(
    'python3', $PY$# Definition for singly-linked list:
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
#         self.next = next
class Solution:
    def reverseList(self, head):
        # Write your code here
        pass$PY$,
    'javascript', $JS$// Definition for singly-linked list:
// function ListNode(val, next) { this.val = val; this.next = next; }
var reverseList = function(head) {
    // Write your code here
};$JS$,
    'cpp', $CPP$#include <bits/stdc++.h>
using namespace std;

struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        // Write your code here
    }
};$CPP$
  ),
  "driverCode" = jsonb_build_object(
    'python3', $PY$import sys

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def _main():
    vals = [int(x) for x in sys.stdin.readline().split()]
    head = None
    for v in reversed(vals):
        head = ListNode(v, head)
    res = Solution().reverseList(head)
    out = []
    while res:
        out.append(str(res.val))
        res = res.next
    print(" ".join(out))

_main()$PY$,
    'javascript', $JS$function ListNode(val, next) { this.val = (val === undefined ? 0 : val); this.next = (next === undefined ? null : next); }
const _vals = require('fs').readFileSync(0, 'utf8').split('\n')[0].split(/\s+/).filter(Boolean).map(Number);
let _head = null;
for (let i = _vals.length - 1; i >= 0; i--) _head = new ListNode(_vals[i], _head);
let _res = reverseList(_head);
const _out = [];
while (_res) { _out.push(_res.val); _res = _res.next; }
console.log(_out.join(" "));$JS$,
    'cpp', $CPP$int main() {
    string line;
    getline(cin, line);
    istringstream iss(line);
    vector<int> vals; int v;
    while (iss >> v) vals.push_back(v);
    ListNode* head = nullptr;
    for (int i = (int)vals.size() - 1; i >= 0; i--) head = new ListNode(vals[i], head);
    ListNode* res = Solution().reverseList(head);
    string out;
    while (res) { if (!out.empty()) out += " "; out += to_string(res->val); res = res->next; }
    cout << out << endl;
    return 0;
}$CPP$
  ),
  "updatedAt" = NOW()
WHERE slug = 'reverse-linked-list';

-- ── Longest Substring Without Repeating Characters ───────────
-- in : line1=s (may contain spaces; may be empty)
-- out: integer
UPDATE problems SET
  "codeTemplates" = jsonb_build_object(
    'python3', $PY$class Solution:
    def lengthOfLongestSubstring(self, s):
        # Write your code here
        pass$PY$,
    'javascript', $JS$var lengthOfLongestSubstring = function(s) {
    // Write your code here
};$JS$,
    'cpp', $CPP$#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int lengthOfLongestSubstring(string s) {
        // Write your code here
    }
};$CPP$
  ),
  "driverCode" = jsonb_build_object(
    'python3', $PY$import sys

def _main():
    s = sys.stdin.readline().rstrip("\n").rstrip("\r")
    print(Solution().lengthOfLongestSubstring(s))

_main()$PY$,
    'javascript', $JS$const _s = require('fs').readFileSync(0, 'utf8').split('\n')[0].replace(/\r$/, '');
console.log(lengthOfLongestSubstring(_s));$JS$,
    'cpp', $CPP$int main() {
    string s;
    getline(cin, s);
    cout << Solution().lengthOfLongestSubstring(s) << endl;
    return 0;
}$CPP$
  ),
  "updatedAt" = NOW()
WHERE slug = 'longest-substring-without-repeating-characters';

-- ── Add Two Numbers ──────────────────────────────────────────
-- in : line1=l1 digits (space-sep) | line2=l2 digits (space-sep)
-- out: space-separated digits of the sum list
UPDATE problems SET
  "codeTemplates" = jsonb_build_object(
    'python3', $PY$# Definition for singly-linked list:
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
#         self.next = next
class Solution:
    def addTwoNumbers(self, l1, l2):
        # Write your code here
        pass$PY$,
    'javascript', $JS$// Definition for singly-linked list:
// function ListNode(val, next) { this.val = val; this.next = next; }
var addTwoNumbers = function(l1, l2) {
    // Write your code here
};$JS$,
    'cpp', $CPP$#include <bits/stdc++.h>
using namespace std;

struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

class Solution {
public:
    ListNode* addTwoNumbers(ListNode* l1, ListNode* l2) {
        // Write your code here
    }
};$CPP$
  ),
  "driverCode" = jsonb_build_object(
    'python3', $PY$import sys

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def _build(vals):
    head = None
    for v in reversed(vals):
        head = ListNode(v, head)
    return head

def _main():
    lines = sys.stdin.read().split("\n")
    l1 = _build([int(x) for x in lines[0].split()])
    l2 = _build([int(x) for x in lines[1].split()])
    res = Solution().addTwoNumbers(l1, l2)
    out = []
    while res:
        out.append(str(res.val))
        res = res.next
    print(" ".join(out))

_main()$PY$,
    'javascript', $JS$function ListNode(val, next) { this.val = (val === undefined ? 0 : val); this.next = (next === undefined ? null : next); }
function _build(vals) { let h = null; for (let i = vals.length - 1; i >= 0; i--) h = new ListNode(vals[i], h); return h; }
const _lines = require('fs').readFileSync(0, 'utf8').split('\n');
const _l1 = _build((_lines[0] || '').split(/\s+/).filter(Boolean).map(Number));
const _l2 = _build((_lines[1] || '').split(/\s+/).filter(Boolean).map(Number));
let _res = addTwoNumbers(_l1, _l2);
const _out = [];
while (_res) { _out.push(_res.val); _res = _res.next; }
console.log(_out.join(" "));$JS$,
    'cpp', $CPP$static ListNode* _build(const string& line) {
    istringstream iss(line);
    vector<int> vals; int v;
    while (iss >> v) vals.push_back(v);
    ListNode* head = nullptr;
    for (int i = (int)vals.size() - 1; i >= 0; i--) head = new ListNode(vals[i], head);
    return head;
}

int main() {
    string a, b;
    getline(cin, a);
    getline(cin, b);
    ListNode* res = Solution().addTwoNumbers(_build(a), _build(b));
    string out;
    while (res) { if (!out.empty()) out += " "; out += to_string(res->val); res = res->next; }
    cout << out << endl;
    return 0;
}$CPP$
  ),
  "updatedAt" = NOW()
WHERE slug = 'add-two-numbers';

-- ── Container With Most Water ────────────────────────────────
-- in : line1=n | line2=n ints (height)
-- out: integer
UPDATE problems SET
  "codeTemplates" = jsonb_build_object(
    'python3', $PY$class Solution:
    def maxArea(self, height):
        # Write your code here
        pass$PY$,
    'javascript', $JS$var maxArea = function(height) {
    // Write your code here
};$JS$,
    'cpp', $CPP$#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int maxArea(vector<int>& height) {
        // Write your code here
    }
};$CPP$
  ),
  "driverCode" = jsonb_build_object(
    'python3', $PY$import sys

def _main():
    data = sys.stdin.read().split()
    n = int(data[0])
    height = [int(x) for x in data[1:1 + n]]
    print(Solution().maxArea(height))

_main()$PY$,
    'javascript', $JS$const _d = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean).map(Number);
const _n = _d[0];
const _height = _d.slice(1, 1 + _n);
console.log(maxArea(_height));$JS$,
    'cpp', $CPP$int main() {
    int n; cin >> n;
    vector<int> height(n);
    for (int i = 0; i < n; i++) cin >> height[i];
    cout << Solution().maxArea(height) << endl;
    return 0;
}$CPP$
  ),
  "updatedAt" = NOW()
WHERE slug = 'container-with-most-water';

-- ── 3Sum ─────────────────────────────────────────────────────
-- in : line1=n | line2=n ints (nums)
-- out: one triplet per line, ints space-separated.
--      Driver normalizes: each triplet sorted asc, triplets sorted.
UPDATE problems SET
  "codeTemplates" = jsonb_build_object(
    'python3', $PY$class Solution:
    def threeSum(self, nums):
        # Write your code here
        pass$PY$,
    'javascript', $JS$var threeSum = function(nums) {
    // Write your code here
};$JS$,
    'cpp', $CPP$#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    vector<vector<int>> threeSum(vector<int>& nums) {
        // Write your code here
    }
};$CPP$
  ),
  "driverCode" = jsonb_build_object(
    'python3', $PY$import sys

def _main():
    data = sys.stdin.read().split()
    n = int(data[0])
    nums = [int(x) for x in data[1:1 + n]]
    res = Solution().threeSum(nums)
    for t in sorted(sorted(t) for t in res):
        print(" ".join(str(x) for x in t))

_main()$PY$,
    'javascript', $JS$const _d = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean).map(Number);
const _n = _d[0];
const _nums = _d.slice(1, 1 + _n);
let _res = threeSum(_nums).map(t => t.slice().sort((a, b) => a - b));
_res.sort((a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] - b[i]; } return 0; });
console.log(_res.map(t => t.join(" ")).join("\n"));$JS$,
    'cpp', $CPP$int main() {
    int n; cin >> n;
    vector<int> nums(n);
    for (int i = 0; i < n; i++) cin >> nums[i];
    vector<vector<int>> res = Solution().threeSum(nums);
    for (auto& t : res) sort(t.begin(), t.end());
    sort(res.begin(), res.end());
    for (auto& t : res) {
        for (size_t i = 0; i < t.size(); i++) { if (i) cout << " "; cout << t[i]; }
        cout << "\n";
    }
    return 0;
}$CPP$
  ),
  "updatedAt" = NOW()
WHERE slug = 'three-sum';

-- ── Median of Two Sorted Arrays ──────────────────────────────
-- in : line1=m | line2=m ints (nums1) | line3=n | line4=n ints (nums2)
-- out: median formatted to 5 decimals (e.g. "2.00000")
UPDATE problems SET
  "codeTemplates" = jsonb_build_object(
    'python3', $PY$class Solution:
    def findMedianSortedArrays(self, nums1, nums2):
        # Write your code here
        pass$PY$,
    'javascript', $JS$var findMedianSortedArrays = function(nums1, nums2) {
    // Write your code here
};$JS$,
    'cpp', $CPP$#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    double findMedianSortedArrays(vector<int>& nums1, vector<int>& nums2) {
        // Write your code here
    }
};$CPP$
  ),
  "driverCode" = jsonb_build_object(
    'python3', $PY$import sys

def _main():
    data = sys.stdin.read().split()
    i = 0
    m = int(data[i]); i += 1
    nums1 = [int(x) for x in data[i:i + m]]; i += m
    n = int(data[i]); i += 1
    nums2 = [int(x) for x in data[i:i + n]]; i += n
    print("%.5f" % Solution().findMedianSortedArrays(nums1, nums2))

_main()$PY$,
    'javascript', $JS$const _d = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean).map(Number);
let _i = 0;
const _m = _d[_i++];
const _nums1 = _d.slice(_i, _i + _m); _i += _m;
const _n = _d[_i++];
const _nums2 = _d.slice(_i, _i + _n); _i += _n;
console.log(findMedianSortedArrays(_nums1, _nums2).toFixed(5));$JS$,
    'cpp', $CPP$int main() {
    int m; cin >> m;
    vector<int> nums1(m);
    for (int i = 0; i < m; i++) cin >> nums1[i];
    int n; cin >> n;
    vector<int> nums2(n);
    for (int i = 0; i < n; i++) cin >> nums2[i];
    printf("%.5f\n", Solution().findMedianSortedArrays(nums1, nums2));
    return 0;
}$CPP$
  ),
  "updatedAt" = NOW()
WHERE slug = 'median-of-two-sorted-arrays';

-- ── Trapping Rain Water ──────────────────────────────────────
-- in : line1=n | line2=n ints (height)
-- out: integer
UPDATE problems SET
  "codeTemplates" = jsonb_build_object(
    'python3', $PY$class Solution:
    def trap(self, height):
        # Write your code here
        pass$PY$,
    'javascript', $JS$var trap = function(height) {
    // Write your code here
};$JS$,
    'cpp', $CPP$#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int trap(vector<int>& height) {
        // Write your code here
    }
};$CPP$
  ),
  "driverCode" = jsonb_build_object(
    'python3', $PY$import sys

def _main():
    data = sys.stdin.read().split()
    n = int(data[0])
    height = [int(x) for x in data[1:1 + n]]
    print(Solution().trap(height))

_main()$PY$,
    'javascript', $JS$const _d = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean).map(Number);
const _n = _d[0];
const _height = _d.slice(1, 1 + _n);
console.log(trap(_height));$JS$,
    'cpp', $CPP$int main() {
    int n; cin >> n;
    vector<int> height(n);
    for (int i = 0; i < n; i++) cin >> height[i];
    cout << Solution().trap(height) << endl;
    return 0;
}$CPP$
  ),
  "updatedAt" = NOW()
WHERE slug = 'trapping-rain-water';

-- ── Word Break II ────────────────────────────────────────────
-- in : line1=s | line2=wordDict (space-separated words)
-- out: one sentence per line. Driver normalizes: sentences sorted.
UPDATE problems SET
  "codeTemplates" = jsonb_build_object(
    'python3', $PY$class Solution:
    def wordBreak(self, s, wordDict):
        # Write your code here
        pass$PY$,
    'javascript', $JS$var wordBreak = function(s, wordDict) {
    // Write your code here
};$JS$,
    'cpp', $CPP$#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    vector<string> wordBreak(string s, vector<string>& wordDict) {
        // Write your code here
    }
};$CPP$
  ),
  "driverCode" = jsonb_build_object(
    'python3', $PY$import sys

def _main():
    lines = sys.stdin.read().split("\n")
    s = lines[0].strip()
    wordDict = lines[1].split() if len(lines) > 1 else []
    res = Solution().wordBreak(s, wordDict)
    for sentence in sorted(res):
        print(sentence)

_main()$PY$,
    'javascript', $JS$const _lines = require('fs').readFileSync(0, 'utf8').split('\n');
const _s = _lines[0].trim();
const _wordDict = (_lines[1] || '').split(/\s+/).filter(Boolean);
const _res = wordBreak(_s, _wordDict).slice().sort();
console.log(_res.join("\n"));$JS$,
    'cpp', $CPP$int main() {
    string s;
    getline(cin, s);
    string line;
    getline(cin, line);
    istringstream iss(line);
    vector<string> wordDict; string w;
    while (iss >> w) wordDict.push_back(w);
    vector<string> res = Solution().wordBreak(s, wordDict);
    sort(res.begin(), res.end());
    for (auto& r : res) cout << r << "\n";
    return 0;
}$CPP$
  ),
  "updatedAt" = NOW()
WHERE slug = 'word-break-ii';

COMMIT;
