// 评分：女性化程度 + 颜值分
// 锚点为「男/女典型区间」的近似值，量纲与 metrics.js 输出一致。
// 说明：这些锚点是启发式标定（参考面部女性化手术文献所述方向 + 常见人体测量区间），
//       不是经临床验证的量表。

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function ramp(x, maleAnchor, femaleAnchor) {
  if (!isFinite(x)) return 0;
  const s = (x - maleAnchor) / (femaleAnchor - maleAnchor);
  return clamp01(s);
}
// 反向（越小越女性化）
const rampInv = (x, maleAnchor, femaleAnchor) => ramp(x, maleAnchor, femaleAnchor);

/* ============================================================
 * 女性化程度：7 项
 * ============================================================ */
function collectFem(r, items) {
  // ① 下颌角宽 / 颧宽 —— 权重最高
  {
    const v = r.jawCheek, s = rampInv(v, 0.84, 0.75);
    items.push({ key: 'jaw', name: '下颌角', w: 0.26, s, val: v.toFixed(3), ideal: '0.750',
      note: s < 0.3 ? '下颌外扩明显，腮部宽' : s > 0.7 ? '下颌收得紧' : '居中' });
  }
  // ② 下颚宽 / 颧宽
  {
    const v = r.lowerJaw, s = rampInv(v, 0.72, 0.63);
    items.push({ key: 'lowerjaw', name: '下颚轮廓', w: 0.16, s, val: v.toFixed(3), ideal: '0.630',
      note: s < 0.3 ? '下颚方、外张' : s > 0.7 ? '下颚收窄' : '居中' });
  }
  // ③ 下巴方度 = 宽 / 高
  {
    const v = r.chinSquare, s = rampInv(v, 2.30, 1.95);
    items.push({ key: 'chin', name: '下巴形状', w: 0.16, s, val: v.toFixed(2), ideal: '1.95',
      note: s < 0.3 ? '下巴宽而方' : s > 0.7 ? '下巴尖窄' : '居中' });
  }
  // ④ 下巴长 / 面高
  {
    const v = r.chinH, s = rampInv(v, 0.26, 0.22);
    items.push({ key: 'chinH', name: '下巴长度', w: 0.12, s, val: v.toFixed(3), ideal: '0.220',
      note: s < 0.3 ? '下巴偏长' : s > 0.7 ? '下巴短' : '居中' });
  }
  // ⑤ 外眼角倾斜（负=上扬）
  {
    const v = r.canthalSlant, s = rampInv(v, 2.0, -4.0);
    items.push({ key: 'eye', name: '眼型倾斜', w: 0.10, s, val: v.toFixed(1) + '°', ideal: '-4.0°',
      note: s < 0.3 ? '外眼角下垂' : s > 0.7 ? '外眼角上扬' : '居中' });
  }
  // ⑥ 眼裂高宽比
  {
    const v = r.eyeOpen, s = rampInv(v, 0.32, 0.38);
    items.push({ key: 'eyeOpen', name: '眼裂开度', w: 0.10, s, val: v.toFixed(3), ideal: '0.380',
      note: s < 0.3 ? '眼裂偏窄' : s > 0.7 ? '眼型开阔' : '居中' });
  }
  // ⑦ 鼻宽 / 鼻长
  {
    const v = r.noseAspect, s = rampInv(v, 0.60, 0.50);
    items.push({ key: 'nose', name: '鼻部', w: 0.10, s, val: v.toFixed(3), ideal: '0.500',
      note: s < 0.3 ? '鼻翼偏宽、鼻体偏短' : s > 0.7 ? '鼻型秀气' : '居中' });
  }
  return items;
}

export function femComposite(r) {
  const items = [];
  collectFem(r, items);
  const t = items.reduce((a, b) => a + b.w * b.s, 0);
  const w = items.reduce((a, b) => a + b.w, 0);
  return t / w;
}
export function femininity(r) {
  const items = [];
  collectFem(r, items);
  const t = items.reduce((a, b) => a + b.w * b.s, 0);
  const w = items.reduce((a, b) => a + b.w, 0);
  return { score: (t / w) * 10, items };
}

/* ============================================================
 * 颜值分（分性别）
 * 依据 Grammer 等人「美貌八支柱」中可测项：对称、平均性（比例规整近似）、
 * 性激素标记（性别二态，男女方向相反）、皮肤
 * ============================================================ */
export function beauty(r, skin, gender) {
  const items = [];
  const fem = femComposite(r);

  // ① 对称度
  {
    const s = 1 - clamp01(r.symmetryErr / 0.030);
    items.push({ key: 'sym', name: '对称度', w: 0.30, s, val: (r.symmetryErr * 1000).toFixed(2) + '‰',
      note: '文献支持：对称性普遍被认为有吸引力' });
  }

  // ② 比例规整（近似「平均性」）：中庭/下庭均衡、内眦/眼宽、鼻宽/颧宽
  {
    const a = 1 - clamp01(Math.abs(r.midLow - 1.0) / 0.40);        // 中庭:下庭 理想 1:1
    const b = 1 - clamp01(Math.abs(r.interEye - 1.15) / 0.42);     // 内眦:眼宽 理想 ~1.15
    const c = 1 - clamp01(Math.abs(r.noseWFace - 0.24) / 0.12);    // 鼻宽:颧宽 理想 ~0.25
    const s = a * 0.45 + b * 0.30 + c * 0.25;
    items.push({ key: 'avg', name: '比例规整', w: 0.20, s,
      val: r.midLow.toFixed(2) + ' / ' + r.interEye.toFixed(2),
      note: '中庭下庭比 / 内眦眼宽比，越接近中值越高' });
  }

  // ③ 性别二态 —— 方向按性别翻转
  {
    const s = gender === 'male' ? (1 - fem) : fem;
    const v = gender === 'male' ? (1 - fem) : fem;
    items.push({ key: 'dim', name: gender === 'male' ? '男性化特征' : '女性化特征', w: 0.25, s, val: v.toFixed(2),
      note: gender === 'male' ? '文献：女性偏好更男性化的面部二态' : '文献：男性偏好更女性化的面部二态' });
  }

  // ④ 皮肤
  {
    const s = skin ? skin.score : 0.5;
    items.push({ key: 'skin', name: '皮肤状态', w: 0.15, s, val: skin ? skin.label : '未测',
      note: '八支柱之一：肤色与肤质' });
  }

  // ⑤ 唇鼻比例
  {
    const v = r.mouthNose;
    const s = 1 - clamp01(Math.abs(v - 1.45) / 0.80);
    items.push({ key: 'golden', name: '唇鼻比例', w: 0.10, s, val: v.toFixed(2), note: '嘴宽:鼻宽 理想约 1.45' });
  }

  const t = items.reduce((a, b) => a + b.w * b.s, 0);
  const w = items.reduce((a, b) => a + b.w, 0);
  return { score: (t / w) * 10, items, fem };
}

/* ============================================================
 * 皮肤
 * ============================================================ */
export function analyzeSkin(imageData, box) {
  const { data, width } = imageData;
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(width - 1, Math.ceil(box.x + box.width));
  const y1 = Math.min(imageData.height - 1, Math.ceil(box.y + box.height));
  const fallback = { score: 0.5, label: '区域太小', mean: 128, std: 0, rough: 0 };
  if (x1 - x0 < 8 || y1 - y0 < 8) return fallback;

  let n = 0, sum = 0, sum2 = 0, lap = 0, lapN = 0;
  const lum = (i) => data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  for (let y = y0 + 1; y < y1 - 1; y += 2) {
    for (let x = x0 + 1; x < x1 - 1; x += 2) {
      const i = (y * width + x) * 4;
      const L = lum(i);
      sum += L; sum2 += L * L; n++;
      const Lp = lum(((y - 1) * width + x) * 4) + lum(((y + 1) * width + x) * 4)
        + lum((y * width + x - 1) * 4) + lum((y * width + x + 1) * 4) - 4 * L;
      lap += Math.abs(Lp); lapN++;
    }
  }
  if (!n) return fallback;
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  const rough = lap / Math.max(1, lapN);
  const sRough = 1 - clamp01(rough / 14);
  const sUniform = 1 - clamp01(std / 42);
  const sBright = 1 - clamp01(Math.abs(mean - 128) / 78);
  const score = sRough * 0.5 + sUniform * 0.3 + sBright * 0.2;
  const label = score > 0.72 ? '平顺、色差小' : score > 0.5 ? '尚匀，有轻微纹理' : '纹理/色差较明显';
  return { score, label, mean, std, rough };
}

/* ============================================================
 * 拍摄提示（只提示，不拦）
 * ============================================================ */
export function captureCheck(box, W, H) {
  if (!box) return { ok: false, hint: '把脸放进框里' };
  const mx = W * 0.045, my = H * 0.045;
  if (box.width > W * 0.92 || box.height > H * 0.92) return { ok: false, hint: '脸太大 —— 往后退一点' };
  if (box.x < mx) return { ok: false, hint: '往左一点' };
  if (box.x + box.width > W - mx) return { ok: false, hint: '往右一点' };
  if (box.y < my) return { ok: false, hint: '头抬高一点，额头要进框' };
  if (box.y + box.height > H - my) return { ok: false, hint: '头低一点，下巴要进框' };
  return { ok: true, hint: '✓ 可以拍了' };
}
