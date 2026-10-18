import { captureCheck } from './src/score.js';
const W = 320, H = 240;
const cases = [
  ['正中',            { x: 100, y: 50, width: 120, height: 140 }],
  ['偏左出框',        { x: 2,   y: 50, width: 120, height: 140 }],
  ['偏右出框',        { x: 210, y: 50, width: 120, height: 140 }],
  ['额头出框',        { x: 100, y: 1,  width: 120, height: 140 }],
  ['下巴出框',        { x: 100, y: 110, width: 120, height: 140 }],
  ['脸太大',          { x: 10,  y: 4,  width: 300, height: 232 }],
  ['没脸',            null],
];
let pass = 0;
for (const [name, box] of cases) {
  const r = captureCheck(box, W, H);
  const expect = name === '正中';
  const ok = r.ok === expect;
  if (ok) pass++;
  console.log((ok?'✅':'❌') + ' ' + name.padEnd(6) + ' → ok=' + r.ok + '  ' + r.hint);
}
console.log(`\n${pass}/${cases.length} 通过`);
