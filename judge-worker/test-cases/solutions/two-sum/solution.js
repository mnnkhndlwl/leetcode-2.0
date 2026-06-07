// Two Sum — hash-map O(n) solution
// Input format (stdin):
//   Line 1: n (number of elements)
//   Line 2: space-separated integers, e.g. "2 7 11 15"
//   Line 3: target integer, e.g. 9
// Output: space-separated indices, e.g. "0 1"

const lines = require("fs").readFileSync("/dev/stdin", "utf8").trim().split("\n");
const nums = lines[1].split(" ").map(Number);
const target = parseInt(lines[2], 10);

const seen = {};
for (let i = 0; i < nums.length; i++) {
  const complement = target - nums[i];
  if (seen[complement] !== undefined) {
    console.log(seen[complement] + " " + i);
    process.exit(0);
  }
  seen[nums[i]] = i;
}
