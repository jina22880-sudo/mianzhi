// 从 68 个关键点量几何量（含头部歪斜校正）
// face-api / dlib 68 点：
//   0-16  下颌轮廓（0 右耳前 … 8 下巴 … 16 左耳前）
//   17-21 右眉 22-26 左眉
//   27 鼻根 30 鼻尖 31 右鼻翼 33 鼻底 35 左鼻翼
//   36 右眼外角 39 右眼内角 42 左眼内角 45 左眼外角
//   48 右嘴角 51 上唇中点 54 左嘴角 57 下唇中点
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 绕中心旋转，消除头部歪斜（roll）对角度和对称的污染 */
function deroll(p) {
  const innerL = p[42], innerR = p[39];
  const roll = Math.atan2(innerL.y - innerR.y, innerL.x - innerR.x);
  if (!isFinite(roll) || Math.abs(roll) < 1e-4) return { pts: p, roll: 0 };
  const cx = (innerL.x + innerR.x) / 2, cy = (innerL.y + innerR.y) / 2;
  const cos = Math.cos(-roll), sin = Math.sin(-roll);
  const out = p.map(q => {
    const dx = q.x - cx, dy = q.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  });
  return { pts: out, roll: roll * 180 / Math.PI };
}

export function measure(rawPts, img) {
  const { pts: p, roll } = deroll(rawPts);

  const bizygomatic = Math.abs(p[2].x - p[14].x);      // 颧宽
  const bigonial = Math.abs(p[4].x - p[12].x);         // 下颌角宽
  const lowerJaw = Math.abs(p[5].x - p[11].x);         // 下颚宽
  const faceH = Math.abs(p[8].y - p[27].y);            // 面高：鼻根→下巴
  const midX = (p[27].x + p[30].x + p[8].x) / 3;

  // 眼
  const eyeW = (d(p[36], p[39]) + d(p[42], p[45])) / 2;
  const eyeH = ((d(p[37], p[41]) + d(p[38], p[40])) / 2 + (d(p[43], p[47]) + d(p[44], p[46])) / 2) / 2;
  const eyeOpen = eyeH / (eyeW || 1);
  const intercanthal = d(p[39], p[42]);                 // ★ 内眦：39 与 42
  // 外眼角倾斜：外角比内角高 = 上扬。y 向下，故上扬为负值。
  const slantR = Math.atan2(p[36].y - p[39].y, Math.abs(p[36].x - p[39].x)) * 180 / Math.PI;
  const slantL = Math.atan2(p[45].y - p[42].y, Math.abs(p[45].x - p[42].x)) * 180 / Math.PI;
  const canthalSlant = (slantR + slantL) / 2;           // <0 上扬（女向），>0 下垂（男向）

  // 眉－眼：取离眼最近的那颗眉点，避开眉毛厚度
  let browGap = 1e9;
  for (const i of [17, 18, 19, 20, 21, 22, 23, 24, 25, 26]) {
    browGap = Math.min(browGap, (p[37].y + p[38].y + p[43].y + p[44].y) / 4 - p[i].y);
  }

  // 鼻
  const noseW = d(p[31], p[35]);
  const noseL = d(p[27], p[30]);

  // 唇 / 下巴
  const mouthW = d(p[48], p[54]);
  const philtrum = Math.abs(p[51].y - p[33].y);
  const chinW = Math.abs(p[6].x - p[10].x);
  const chinH = Math.abs(p[8].y - p[57].y);

  // 中庭 / 下庭
  const browLineY = (p[19].y + p[24].y) / 2;
  const mid = Math.abs(p[33].y - browLineY);
  const low = Math.abs(p[8].y - p[33].y);

  // 对称（歪斜已校正）
  const pairs = [[0, 16], [1, 15], [2, 14], [3, 13], [4, 12], [5, 11], [6, 10], [7, 9],
                 [36, 45], [37, 44], [38, 43], [39, 42], [31, 35], [48, 54], [17, 26], [18, 25], [19, 24], [20, 23], [21, 22]];
  let symSum = 0;
  for (const [a, b] of pairs) symSum += Math.abs((p[a].x + p[b].x) / 2 - midX);
  const symmetryErr = symSum / pairs.length / (faceH || 1);

  const yaw = Math.abs(p[30].x - midX) / (faceH || 1);
  const pitchProxy = noseL / (Math.abs(p[27].y - p[36].y) + noseL + 1e-6);

  return {
    roll,
    r: {
      jawCheek: bigonial / (bizygomatic || 1),          // 下颌角宽 / 颧宽
      lowerJaw: lowerJaw / (bizygomatic || 1),          // 下颚宽 / 颧宽
      chinSquare: chinW / (chinH || 1),                 // 下巴宽 / 下巴高（方度）
      chinH: chinH / (faceH || 1),                      // 下巴长 / 面高
      browGap: browGap / (faceH || 1),                  // 眉－眼距 / 面高
      eyeOpen,                                          // 眼裂高宽比
      interEye: intercanthal / (eyeW || 1),             // 内眦 / 眼宽
      canthalSlant,                                     // 外眼角倾斜（负=上扬）
      noseAspect: noseW / (noseL || 1),                 // 鼻宽 / 鼻长
      noseWFace: noseW / (bizygomatic || 1),
      mouthNose: mouthW / (noseW || 1),
      philtrum: philtrum / (faceH || 1),
      midLow: mid / (low || 1),                         // 中庭 / 下庭
      symmetryErr,
      wHR: bizygomatic / (faceH || 1),
      faceRatioInFrame: (Math.abs(p[0].x - p[16].x)) / img.width,
      yaw, pitchProxy,
    },
  };
}

export { d as dist };
