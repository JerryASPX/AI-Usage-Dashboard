const assert = require('node:assert/strict');
require('./parser.js');

const official = `尚無使用量。您的每週限額還剩 100%。
目前工作階段
從您的第一則訊息開始
已使用 0%
本週
星期五上午 5:00 重設
已使用 0%`;
const summary = text => globalThis.UsageParser.parseUsage(text, 'claude').metrics
  .map(({id, value, kind}) => ({id, value, kind}));
const expected = [
  {id: 'current', value: 0, kind: 'used'},
  {id: 'weekly', value: 0, kind: 'used'},
];
const result = summary(official);
assert.deepEqual(result, expected);
console.log('Official zh-TW:', JSON.stringify(result));

assert.deepEqual(summary(official.replaceAll('已使用 0%', '還剩 100%\n已使用 0%')), expected);
const remaining = summary(official.replaceAll('已使用 0%', '還剩 100%'));
assert.deepEqual(remaining, expected.map(metric => ({...metric, value: 100, kind: 'remaining'})));
console.log('Remaining only:', JSON.stringify(remaining));

assert.deepEqual(summary('Current session\n0% used\nWeekly\n100% remaining\n0% used'), expected);
assert.deepEqual(summary(official.replace('目前工作階段', '本次工作階段')), expected);
assert.deepEqual(summary('尚無使用量。您的每週限額還剩 100%。'), []);
console.log('All Claude parser self-checks passed.');
