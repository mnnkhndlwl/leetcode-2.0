var twoSum = function(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
};

const _d = require('fs').readFileSync(0, 'utf8').split(/\s+/).filter(Boolean).map(Number);
const _n = _d[0];
const _nums = _d.slice(1, 1 + _n);
const _target = _d[1 + _n];
const _res = twoSum(_nums, _target);
console.log(_res[0] + " " + _res[1]);