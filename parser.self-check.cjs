const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
const officialCollapsed = caret => `目前工作階段
從您的第一則訊息開始
已使用 0%
本週${caret}
星期五上午5:00 重設
已使用 80%`;
for (const caret of [' ▾', '▼']) {
  const text = officialCollapsed(caret);
  const metrics = globalThis.UsageParser.parseUsage(text, 'claude').metrics;
  assert.deepEqual(metrics.map(({id,value,kind})=>({id,value,kind})), [
    {id:'current',value:0,kind:'used'}, {id:'weekly',value:80,kind:'used'},
  ]);
  assert.equal(metrics.find(m=>m.id==='current').reset.includes('星期五'), false);
  assert.match(metrics.find(m=>m.id==='weekly').reset,/星期五上午5:00/);
}
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
const currentNotice = 'Current session\nAvailable after your first message';
for (const caret of ['\u2304', '\u02c5', '\u25be', '\u25bc']) {
  const collapsed = `${currentNotice}\n0% used\nWeekly ${caret}\nResets Friday 5:00 PM\n80% used`;
  const metrics = globalThis.UsageParser.parseUsage(collapsed, 'claude').metrics;
  assert.deepEqual(metrics.map(({id,value,kind})=>({id,value,kind})), [
    {id:'current',value:0,kind:'used'}, {id:'weekly',value:80,kind:'used'},
  ]);
  assert.match(metrics.find(m=>m.id==='weekly').reset,/Friday 5:00 PM/);
}
const stray = `${currentNotice}\n100%\nWeekly \u2304\nResets Friday 5:00 PM\n80% used`;
assert.deepEqual(summary(stray), [
  {id:'current',value:0,kind:'used'}, {id:'weekly',value:80,kind:'used'},
]);
const expanded = `${currentNotice}\n0% used\nWeekly \u2304\nResets Friday 5:00 PM\n80% used\nFable\nAt most 50% of weekly usage\nResets Friday 5:00 PM\n21% used`;
const expandedMetrics = globalThis.UsageParser.parseUsage(expanded,'claude').metrics;
assert.deepEqual(expandedMetrics.map(({id,value,kind})=>({id,value,kind})), [
  {id:'current',value:0,kind:'used'}, {id:'weekly',value:80,kind:'used'}, {id:'fable',value:21,kind:'used'},
]);
assert.match(expandedMetrics.find(m=>m.id==='fable').note,/at most 50%/i);
const officialExpanded = `目前工作階段
從您的第一則訊息開始
已使用 0%
本週 ▲
星期五上午5:00 重設
已使用 80%
Fable
最多可使用您每週上限的 50%
星期五上午5:00 重設
已使用 21%`;
const zhExpandedMetrics = globalThis.UsageParser.parseUsage(officialExpanded,'claude').metrics;
assert.deepEqual(zhExpandedMetrics.map(({id,value,kind})=>({id,value,kind})), [
  {id:'current',value:0,kind:'used'}, {id:'weekly',value:80,kind:'used'}, {id:'fable',value:21,kind:'used'},
]);
assert.match(zhExpandedMetrics.find(m=>m.id==='fable').note,/最多可使用您每週上限的 50%/);
for (const currentValue of ['100%', '已使用 0%\n100%']) {
  const zhStray = `目前工作階段\n從您的第一則訊息開始\n${currentValue}\n本週 ▾\n星期五上午5:00 重設\n已使用 80%`;
  assert.deepEqual(summary(zhStray), [
    {id:'current',value:0,kind:'used'}, {id:'weekly',value:80,kind:'used'},
  ]);
}
const weeklyLimits = `目前工作階段\n從您的第一則訊息開始\n已使用 0%\n每週限制\n星期五上午5:00 重設\n已使用 80%`;
assert.deepEqual(summary(weeklyLimits), [
  {id:'current',value:0,kind:'used'}, {id:'weekly',value:80,kind:'used'},
]);
console.log('Claude dropdown, stray percent, and Fable checks passed.');
console.log('All Claude parser self-checks passed.');

function grok(text){
  const parsed = globalThis.UsageParser.parseUsage(text, 'grok');
  const total = parsed.metrics.find(metric => metric.id === 'total');
  return {
    state: parsed.state,
    total: total ? total.value : null,
    reset: total ? total.reset : '',
    products: (parsed.distribution?.products || []).map(product => ({label: product.label, value: product.value})),
    inferred: Boolean(parsed.distribution?.totalInferred),
  };
}
const readFixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8').replace(/\n$/, '');
const zh = readFixture('grok-usage-zh-TW.txt');
const en = readFixture('grok-usage-en.txt');
const zhUsage = {
  state: 'ready',
  total: 7,
  reset: '重設於2026年11月15日 下午2:34',
  products: [{label: 'Grok Bot', value: 7}],
  inferred: false,
};
const enUsage = {
  state: 'ready',
  total: 7,
  reset: 'Resets on Nov 15, 2026, 2:34 PM',
  products: [{label: 'Grok Bot', value: 7}],
  inferred: false,
};
assert.deepEqual(grok(zh), zhUsage);
assert.deepEqual(grok(en), enUsage);
console.log('Screenshot zh-TW:', JSON.stringify(grok(zh)));
console.log('English equivalent:', JSON.stringify(grok(en)));

const zhFlat = grok(zh.replace(/\n+/g, ' '));
assert.equal(zhFlat.state, 'ready');
assert.equal(zhFlat.total, 7);
assert.equal(zhFlat.inferred, false);
assert.deepEqual(zhFlat.products, zhUsage.products);
assert.match(zhFlat.reset, /重設於2026年11月15日 下午2:34/);
assert.doesNotMatch(zhFlat.reset, /額外點數|額外使用額度|US\$0\.00/);
const enFlat = grok(en.replace(/\n+/g, ' '));
assert.equal(enFlat.total, 7);
assert.equal(enFlat.inferred, false);
assert.deepEqual(enFlat.products, enUsage.products);
assert.match(enFlat.reset, /Resets on Nov 15, 2026, 2:34 PM/);
assert.doesNotMatch(enFlat.reset, /Extra credits|Extra usage allowance|US\$0\.00/);

assert.deepEqual(grok([zh, 'Usage', '額外點數 0%', 'Extra credits 0%', '額外使用額度 0%'].join('\n')), zhUsage);
assert.deepEqual(grok([en, 'Usage', 'Extra credits 7%', 'Additional credits 0%', 'Bonus credits', '0%'].join('\n')), enUsage);
assert.deepEqual(grok(`使用情況
每週 Premium 限制
7% 已使用
重設於2026年11月15日 下午2:34
Grok Bot 7%
額外點數 7%`), zhUsage);
assert.deepEqual(grok(`Usage
Weekly Premium limit
7% used
Resets on Nov 15, 2026, 2:34 PM
Grok Bot
7%
Extra credits
0%`), enUsage);
assert.deepEqual(grok('Usage\n額外點數 0%'), {state: 'no_numbers', total: null, reset: '', products: [], inferred: false});
assert.deepEqual(grok('Usage\nExtra credits 7%'), {state: 'no_numbers', total: null, reset: '', products: [], inferred: false});
assert.deepEqual(grok('使用情況\n額外點數\n7%\nUS$0.00'), {state: 'no_numbers', total: null, reset: '', products: [], inferred: false});

assert.deepEqual(grok(`使用情況
每週 Premium 限制
40% 已使用
重設於2026年11月15日 下午2:34
Imagine 25%
語音 15%
額外使用額度
US$0.00
額外點數`), {
  state: 'ready',
  total: 40,
  reset: '重設於2026年11月15日 下午2:34',
  products: [{label: 'Imagine', value: 25}, {label: 'Voice', value: 15}],
  inferred: false,
});
assert.deepEqual(grok(`Usage
Weekly Premium limit
9% used
Resets on Nov 15, 2026, 2:34 PM
Notebook 2%
Grok Bot 7%
Extra credits`), {
  state: 'ready',
  total: 9,
  reset: 'Resets on Nov 15, 2026, 2:34 PM',
  products: [{label: 'Grok Bot', value: 7}, {label: 'Notebook', value: 2}],
  inferred: false,
});
assert.deepEqual(grok(`使用情況
每周 Premium 限制
7% 已使用
重置於2026年11月15日 下午2:34
Grok Bot 7%
额外使用额度
US$0.00
额外点数`), {
  state: 'ready',
  total: 7,
  reset: '重置於2026年11月15日 下午2:34',
  products: [{label: 'Grok Bot', value: 7}],
  inferred: false,
});

const background = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
const parserSource = fs.readFileSync(path.join(__dirname, 'parser.js'), 'utf8');
const backgroundBalance = background.match(/const balanceRE=\/(.+)\/i;/);
const parserBalance = parserSource.match(/const balanceMark=\/(.+)\/i;/);
assert.ok(backgroundBalance && parserBalance);
assert.equal(backgroundBalance[1], parserBalance[1]);
const balanceRE = new RegExp(backgroundBalance[1], 'i');
for(const label of ['額外點數', '額外使用額度', '額外用量', '额外点数', '额外使用额度', '额外用量', 'Extra credits', 'Extra credit', 'Additional credits', 'Bonus credits', 'Extra usage', 'Extra usage allowance', 'Additional usage']){
  assert.equal(balanceRE.test(label), true, label);
}
for(const label of ['Grok Bot', 'Imagine', 'Notebook', '語音', '7% 已使用', '每週 Premium 限制', 'US$0.00', '管理', 'Manage', 'Resets on Nov 15, 2026, 2:34 PM']){
  assert.equal(balanceRE.test(label), false, label);
}
assert.match(background, /!balanceRE\.test\(label\)&&!balanceRE\.test\(name\)/);
assert.match(background, /for\(let attempt=0;attempt<4;attempt\+\+\)/);
assert.match(background, /if\(attempt<3\)await chrome\.tabs\.reload\(temporary\.id\)/);
assert.ok(background.indexOf('balanceRE') < background.indexOf('for(let attempt=0;attempt<4;attempt++)'));
console.log('All Grok extra-credit parser self-checks passed.');
