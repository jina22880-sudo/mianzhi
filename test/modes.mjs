import { femininity, attractiveness, analyzeSkin, captureCheck } from './src/score.js';

// 造两组极端比值：一组偏女性典型，一组偏男性典型
const female = {
  browEyeGap:0.086, eyeOpen:0.44, canthalTilt:7,
  noseWFace:0.245, noseLFace:0.375,
  jawCheek:0.700, jawFace:0.860,
  chinWFace:0.265, chinHFace:0.145,
  philtrumFace:0.060, mouthNose:1.66,
  symmetryErr:0.002, thirdsNorm:[1/3,1/3,1/3], interEye:1.0,
  wHR:1.85, faceRatioInFrame:0.5, yaw:0.01, roll:0.02, pitchProxy:0.33,
};
const male = {
  browEyeGap:0.052, eyeOpen:0.335, canthalTilt:-1,
  noseWFace:0.305, noseLFace:0.445,
  jawCheek:0.840, jawFace:0.965,
  chinWFace:0.335, chinHFace:0.210,
  philtrumFace:0.076, mouthNose:1.42,
  symmetryErr:0.009, thirdsNorm:[0.29,0.36,0.35], interEye:1.28,
  wHR:2.05, faceRatioInFrame:0.5, yaw:0.02, roll:0.03, pitchProxy:0.33,
};
const mid = { ...female };
for (const k of ['browEyeGap','eyeOpen','canthalTilt','noseWFace','noseLFace','jawCheek','jawFace','chinWFace','chinHFace','philtrumFace','mouthNose']) {
  const a = male[k], b = female[k];
  mid[k] = (a + b) / 2;
}

const skinGood = { score: 0.9, label: 'ok', mean: 130, std: 12, rough: 3 };
const skinBad  = { score: 0.25, label: 'bad', mean: 130, std: 40, rough: 15 };

const fF = femininity(female), fM = femininity(male), fMid = femininity(mid);
const aF = attractiveness(female, skinGood), aM = attractiveness(male, skinBad);

const ok = (c, msg) => console.log((c ? '✅' : '❌') + ' ' + msg);

console.log('女性化 · 女性典型 =', fF.score.toFixed(2));
console.log('女性化 · 中间值   =', fMid.score.toFixed(2));
console.log('女性化 · 男性典型 =', fM.score.toFixed(2));
console.log('颜值   · 女性典型+好皮肤 =', aF.score.toFixed(2));
console.log('颜值   · 男性典型+差皮肤 =', aM.score.toFixed(2));
console.log('');
ok(fF.score > fMid.score && fMid.score > fM.score, '女性化：女 > 中 > 男，单调');
ok(fF.score > 8.5 && fM.score < 2.0, '女性化：两端拉开（>8.5 / <2.0）');
ok(Math.abs(fMid.score - 5.0) < 0.6, '女性化：中间值≈5.0（不送分）');
ok(fF.items.length === 7, '女性化：7 个子项');
ok(Math.abs(fF.items.reduce((a,b)=>a+b.w,0) - 1) < 1e-6, '权重合计 = 1');
ok(aF.score > aM.score, '颜值：好条件 > 差条件');
ok([fF,fM,aF,aM].every(r => r.score >= 0 && r.score <= 10), '所有分数都在 0..10');

// 拍摄门禁
const okGate = captureCheck(female, skinGood);
const badGate = captureCheck({ ...female, faceRatioInFrame: 0.2, yaw: 0.2 }, skinGood);
ok(okGate.ok === true, '门禁：标准姿势通过');
ok(badGate.ok === false && badGate.hints.length > 0, '门禁：不合格会拦（' + badGate.hints.join(' / ') + '）');

// 皮肤
const w = 32, h = 32, data = new Uint8ClampedArray(w*h*4);
for (let i=0;i<w*h;i++){ data[i*4]=120; data[i*4+1]=130; data[i*4+2]=140; data[i*4+3]=255; }
const sk = analyzeSkin({ data, width:w, height:h }, { x:4,y:4,w:24,h:24 });
ok(sk.score > 0.8, '皮肤：纯色区域得分高 (' + sk.score.toFixed(2) + ')');
import { beauty, femininity, femComposite } from './src/score.js';
const base = {
  browEyeGap:0.086, eyeOpen:0.44, canthalTilt:7, noseWFace:0.245, noseLFace:0.375,
  jawCheek:0.700, jawFace:0.860, chinWFace:0.265, chinHFace:0.145,
  philtrumFace:0.060, mouthNose:1.66, symmetryErr:0.002,
  thirdsNorm:[1/3,1/3,1/3], interEye:1.0, wHR:1.90,
};
const skin = { score:0.85, label:'平顺', mean:130, std:12, rough:3 };
const fem = { ...base };
const masc = { ...base, browEyeGap:0.052, eyeOpen:0.335, canthalTilt:-1, noseWFace:0.305,
  noseLFace:0.445, jawCheek:0.840, jawFace:0.965, chinWFace:0.335, chinHFace:0.210,
  philtrumFace:0.076, mouthNose:1.42 };

const fF = femininity(fem).score;
const fM = femininity(masc).score;
console.log('女性化程度：女向脸', fF.toFixed(2), '| 男向脸', fM.toFixed(2));

const bF_female = beauty(fem, skin, 'female').score;
const bF_male   = beauty(fem, skin, 'male').score;
const bM_female = beauty(masc, skin, 'female').score;
const bM_male   = beauty(masc, skin, 'male').score;

console.log('');
console.log('同一张「女向脸」：按女标准', bF_female.toFixed(2), ' / 按男标准', bF_male.toFixed(2));
console.log('同一张「男向脸」：按女标准', bM_female.toFixed(2), ' / 按男标准', bM_male.toFixed(2));

const ok=(c,m)=>console.log((c?'✅':'❌')+' '+m);
ok(fF > fM, '女性化：女向脸 > 男向脸');
ok(bF_female > bF_male, '女向脸：选「女」分数更高（二态方向正确）');
ok(bM_male > bM_female, '男向脸：选「男」分数更高（二态方向翻转正确）');
ok([bF_female,bF_male,bM_female,bM_male].every(v=>v>=0&&v<=10), '所有颜值分在 0..10');
ok(Math.abs(femComposite(fem) - fF/10) < 1e-9, 'femComposite 与 femininity 一致');
