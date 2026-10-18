// 面值 · 主程序
import { measure } from './metrics.js';
import { beauty, femininity, analyzeSkin, captureCheck } from './score.js';

const faceapi = window.faceapi;
const $ = (s) => document.querySelector(s);

const S = {
  mode: 'beauty',    // fem | beauty
  gender: 'female',
  stream: null, video: null,
  busy: false, last: 0, detOpts: null,
  check: null, backend: '', captured: false,
  liveCv: null, liveCtx: null,
  camOn: false,
  gen: 0,          // 世代：每次进退取景页 +1，旧循环自动退役
};

/* ============ 后端 ============ */
function webglUsable() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const mk = (t, src) => {
      const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('s');
      return sh;
    };
    const vs = mk(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');
    const fs = mk(gl.FRAGMENT_SHADER, 'precision mediump float;void main(){gl_FragColor=vec4(1.);}');
    const pr = gl.createProgram();
    gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('l');
    return true;
  } catch (e) { return false; }
}

async function ensureBackend() {
  const tf = faceapi.tf;
  const force = /[?&]cpu=1/.test(location.search);
  const want = (force || !webglUsable()) ? 'cpu' : 'webgl';
  try { await tf.setBackend(want); await tf.ready(); S.backend = want; }
  catch (e) { await tf.setBackend('cpu'); await tf.ready(); S.backend = 'cpu'; }
  S.detOpts = S.backend === 'cpu'
    ? new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.35 })
    : new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
}

async function ensureModels() {
  if (S.detOpts) return;
  await faceapi.nets.tinyFaceDetector.loadFromUri('models/');
  await faceapi.nets.faceLandmark68Net.loadFromUri('models/');
  await ensureBackend();
}

/* ============ 相机 ============ */
async function openCamera() {
  if (S.stream) return;
  const tries = [
    { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false },
    { video: { facingMode: 'user' }, audio: false },
    { video: true, audio: false },
  ];
  let err = null;
  for (const c of tries) {
    try { S.stream = await navigator.mediaDevices.getUserMedia(c); break; }
    catch (e) { err = e; }
  }
  if (!S.stream) throw err || new Error('无法打开相机');
  const v = $('#cam');
  v.srcObject = S.stream; v.muted = true; v.playsInline = true;
  await v.play();
  S.video = v; S.camOn = true;
}

function closeCamera() {
  try { if (S.stream) S.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { }
  S.stream = null; S.video = null; S.camOn = false;
  const v = $('#cam'); if (v) v.srcObject = null;
}

/* ============ 实时门禁 ============ */
function fitLive() {
  const v = S.video;
  const ratio = (v && v.videoWidth) ? (v.videoHeight / v.videoWidth) : 0.75;
  S.liveCv.width = 320;
  S.liveCv.height = Math.max(180, Math.round(320 * ratio));
}

async function liveLoop(gen) {
  if (gen !== S.gen) return;                       // 旧循环直接退役
  if (!S.video || S.captured || !S.camOn) return;
  requestAnimationFrame(function () { liveLoop(gen); });
  const now = performance.now();
  const gap = S.backend === 'cpu' ? 280 : 110;
  if (S.busy || now - S.last < gap) return;
  S.busy = true; S.last = now;
  try {
    if (S.liveCv.width !== 320) fitLive();
    S.liveCtx.drawImage(S.video, 0, 0, S.liveCv.width, S.liveCv.height);
    if (!S.detOpts) return;                        // 模型没就绪就别硬调
    const det = await faceapi.detectSingleFace(S.liveCv, S.detOpts);
    const box = det ? boxOf(det) : null;
    S.check = box ? captureCheck(box, S.liveCv.width, S.liveCv.height)
                  : { ok: false, hint: '没看到脸，对准一点会更准' };
    paintHint();
  } catch (e) {
    const h = $('#hintbar');
    if (h) { h.textContent = '识别出错：' + ((e && e.message) || e); h.className = 'hint bad'; }
  } finally { S.busy = false; }
}

function paintHint() {
  const bar = $('#hintbar'), btn = $('#shoot');
  if (btn) btn.disabled = false;                 // 永不锁快门
  if (!S.check) return;
  bar.textContent = S.check.ok ? '✓ 位置不错，可以拍' : (S.check.hint + '（也能直接拍）');
  bar.className = 'hint ' + (S.check.ok ? 'ok' : 'bad');
}

/* ============ 工具 ============ */
function boxOf(det) {
  if (!det) return null;
  if (det.box && typeof det.box.width === 'number') return det.box;
  if (det.detection && det.detection.box) return det.detection.box;
  if (det.relativeBox) return det.relativeBox;
  return null;
}

/* ============ 分析 ============ */
/** 多尺度 + 中心裁剪重试：相册图片脸偏小/偏侧时也能捞到 */
async function detectWithFallback(canvas, wantLandmarks) {
  // CPU 后端算力有限：少试几档、跳过裁剪重试，避免等太久
  const cpu = S.backend === 'cpu';
  const sizes = cpu ? [416, 320] : [608, 512, 416];
  const tryOnce = async (cv, size) => {
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: 0.18 });
    let task = faceapi.detectSingleFace(cv, opts);
    if (wantLandmarks) task = task.withFaceLandmarks();
    return task;
  };
  // 先原图多尺度
  for (const s of sizes) {
    try { const d = await tryOnce(canvas, s); if (d) return d; } catch (e) { }
  }
  // 再中心裁剪 70% 放大一倍重试（仅 GPU 后端）
  if (!cpu) try {
    const W = canvas.width, H = canvas.height;
    const cw = Math.round(W * 0.7), ch = Math.round(H * 0.7);
    const c2 = document.createElement('canvas');
    c2.width = Math.round(cw * 1.4); c2.height = Math.round(ch * 1.4);
    c2.getContext('2d').drawImage(canvas, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, c2.width, c2.height);
    // 裁剪后的坐标要换回原图，这里只用来判断“有没有脸”，返回时做映射
    for (const s of sizes) {
      try {
        const d = await tryOnce(c2, s);
        if (d) { d.__crop = { cw: cw, ch: ch, W: W, H: H, k: 1.4 }; return d; }
      } catch (e) { }
    }
  } catch (e) { }
  return null;
}

/** 把裁剪坐标映射回原图 */
function toOriginal(det, canvas) {
  if (!det) return null;
  if (!det.__crop) return det;
  const c = det.__crop;
  const ox = (c.W - c.cw) / 2, oy = (c.H - c.ch) / 2;
  const fix = (p) => ({ x: ox + p.x / c.k, y: oy + p.y / c.k, z: p.z });
  const out = det;
  if (out.landmarks && out.landmarks.positions) {
    out.landmarks.positions = out.landmarks.positions.map(fix);
  }
  const b = boxOf(det);
  if (b) {
    const nb = { x: ox + b.x / c.k, y: oy + b.y / c.k, width: b.width / c.k, height: b.height / c.k };
    if (det.box) det.box = nb;
    if (det.detection && det.detection.box) det.detection.box = nb;
  }
  return det;
}

function judge(canvas) {
  const ctx = canvas.getContext('2d');
  return detectWithFallback(canvas, true).then(function (raw) {
    if (!raw) return { error: '没找到脸。换一张更清晰的、正脸的图，或者重拍一张' };
    const det = toOriginal(raw, canvas);
    if (!det.landmarks || !det.landmarks.positions) return { error: '没定位到五官，换一张正脸图' };
    const box = boxOf(det);
    if (!box || !(box.width > 4) || !(box.height > 4)) return { error: '没定位到脸，换一张正脸清晰的图' };
    const m = measure(det.landmarks.positions, { width: canvas.width, height: canvas.height });
    if (!m || !m.r || !isFinite(m.r.jawCheek)) return { error: '关键点不完整，换一张正脸清晰的图' };
    const skin = analyzeSkin(ctx.getImageData(0, 0, canvas.width, canvas.height), box);
    const b = beauty(m.r, skin, S.gender);
    const out = { beauty: b, skin: skin, m: m, canvas: canvas };
    if (S.mode === 'fem') out.fem = femininity(m.r);
    return out;
  });
}

async function shoot() {
  const v = S.video;
  if (!v) return;
  const W = Math.min(1000, v.videoWidth || 720);
  const H = Math.round(W * (v.videoHeight || 960) / (v.videoWidth || 720));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
  ctx.drawImage(v, 0, 0, W, H); ctx.restore();
  await runAnalysis(cv);
}

async function fromFile(file) {
  const img = await new Promise(function (res, rej) {
    const u = new Image();
    u.onload = function () { res(u); };
    u.onerror = rej;
    u.src = URL.createObjectURL(file);
  });
  const W = Math.min(1400, img.naturalWidth);
  const H = Math.round(W * img.naturalHeight / img.naturalWidth);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.getContext('2d').drawImage(img, 0, 0, W, H);
  URL.revokeObjectURL(img.src);
  await runAnalysis(cv);
}

async function runAnalysis(cv) {
  const h = $('#hintbar');
  h.className = 'hint';
  h.textContent = '分析中…';
  await new Promise(function (r) { setTimeout(r, 20); });
  let res;
  try { res = await judge(cv); }
  catch (e) { res = { error: '分析失败：' + ((e && e.message) || e) }; }
  if (res.error) { h.textContent = res.error; h.className = 'hint bad'; return; }
  S.captured = true;
  closeCamera();
  render(res);
}

/* ============ 结果 ============ */
function bar(v) {
  const w = Math.max(0, Math.min(100, v * 100));
  return '<span class="bar"><i class="' + (w < 38 ? 'lo' : w < 68 ? 'mid' : 'hi') + '" style="width:' + w + '%"></i></span>';
}
function rows(list) {
  return list.map(function (it) {
    return '<div class="row">'
      + '<div class="rowhead"><b>' + it.name + '</b><span>' + it.val + '</span></div>'
      + bar(it.s)
      + '<div class="rowfoot"><span>' + (it.note || '') + '</span><em>权重 ' + (it.w * 100).toFixed(0) + '%</em></div>'
      + '</div>';
  }).join('');
}

function render(res) {
  $('#stage').classList.add('hidden');
  $('#home').classList.add('hidden');
  $('#result').classList.remove('hidden');

  const tw = 240, th = Math.round(tw * res.canvas.height / res.canvas.width);
  const th0 = $('#thumb'); th0.width = tw; th0.height = th;
  th0.getContext('2d').drawImage(res.canvas, 0, 0, tw, th);

  const isFem = S.mode === 'fem';
  const g = S.gender === 'male' ? '男' : '女';
  $('#modeTag').textContent = isFem ? '女性化程度' : ('颜值打分 · ' + g + '性审美标准');

  const box = $('#scores');
  if (isFem) {
    box.className = 'scores two';
    box.innerHTML = '<div class="sc fem"><div class="k">女 性 化 程 度</div><div class="v">'
      + res.fem.score.toFixed(2) + '</div><div class="u">/ 10.00</div></div>'
      + '<div class="sc att"><div class="k">颜 值 分</div><div class="v">'
      + res.beauty.score.toFixed(2) + '</div><div class="u">/ 10.00</div></div>';
  } else {
    box.className = 'scores one';
    box.innerHTML = '<div class="sc att"><div class="k">颜 值 分 · ' + g + '</div><div class="v">'
      + res.beauty.score.toFixed(2) + '</div><div class="u">/ 10.00</div></div>';
  }

  $('#femWrap').classList.toggle('hidden', !isFem);
  if (isFem) $('#femList').innerHTML = rows(res.fem.items);
  $('#attList').innerHTML = rows(res.beauty.items);

  const f = res.m.r, sk = Object.assign({ mean: 0, std: 0, rough: 0, label: '' }, res.skin || {});
  const n3 = (x) => (typeof x === 'number' && isFinite(x) ? x.toFixed(3) : '—');
  const n2 = (x) => (typeof x === 'number' && isFinite(x) ? x.toFixed(2) : '—');
  $('#raw').innerHTML =
    '歪斜校正 <b>' + n2(res.m.roll) + '°</b> · 对称误差 <b>' + n2(f.symmetryErr * 1000) + '‰</b> · '
    + '中庭/下庭 <b>' + n2(f.midLow) + '</b> · 内眦/眼宽 <b>' + n2(f.interEye) + '</b><br>'
    + '下颌宽/颧宽 <b>' + n3(f.jawCheek) + '</b> · 下颚宽/颧宽 <b>' + n3(f.lowerJaw) + '</b> · '
    + '下巴方度 <b>' + n2(f.chinSquare) + '</b> · 下巴长 <b>' + n3(f.chinH) + '</b><br>'
    + '外眼角倾斜 <b>' + n2(f.canthalSlant) + '°</b>（负=上扬） · 眼裂 <b>' + n3(f.eyeOpen) + '</b> · '
    + '鼻宽/鼻长 <b>' + n3(f.noseAspect) + '</b> · 嘴宽/鼻宽 <b>' + n2(f.mouthNose) + '</b><br>'
    + '面宽/面高 <b>' + n3(f.wHR) + '</b>（参考，性二态有争议） · '
    + '皮肤 均值 <b>' + (sk.mean || 0).toFixed(0) + '</b> 纹理 <b>' + (sk.rough || 0).toFixed(1)
    + '</b> · 后端 <b>' + (S.backend || '?') + '</b>';
}

/* ============ 导航 ============ */
function goHome() {
  S.gen++;
  S.captured = false;
  closeCamera();
  $('#result').classList.add('hidden');
  $('#stage').classList.add('hidden');
  $('#genderPick').classList.add('hidden');
  $('#home').classList.remove('hidden');
}

async function enterStage() {
  S.gen++;                      // 退役所有旧循环
  $('#home').classList.add('hidden');
  $('#genderPick').classList.add('hidden');
  $('#result').classList.add('hidden');
  $('#stage').classList.remove('hidden');
  S.captured = false;
  const h = $('#hintbar');
  h.className = 'hint';
  h.textContent = '正在装载模型…';
  $('#shoot').disabled = false;
  try {
    await ensureModels();
    h.textContent = '正在打开相机…';
    await openCamera();
    await new Promise(function (r) { setTimeout(r, 250); });
    fitLive();
    requestAnimationFrame(function () { liveLoop(S.gen); });
  } catch (e) {
    h.textContent = camErrText(e);
    h.className = 'hint bad';
  }
  const sb = $('#shoot'); if (sb) sb.disabled = false;
}

function camErrText(e) {
  const n = (e && e.name) || '';
  if (n === 'NotAllowedError') return '相机权限被拒绝 —— 设置→应用→面值→权限 打开相机';
  if (n === 'NotFoundError') return '没找到摄像头，可用右下角从相册选';
  if (n === 'NotReadableError') return '相机被占用，关掉别的相机应用再试';
  return '相机打不开：' + ((e && e.message) || e);
}

/* ============ 启动 ============ */
export async function boot() {
  S.liveCv = document.createElement('canvas');
  S.liveCtx = S.liveCv.getContext('2d', { willReadFrequently: true });

  // 公告
  $('#noticeOk').onclick = function () { $('#notice').classList.add('hidden'); };
  $('#why').onclick = function () { $('#about').classList.remove('hidden'); };
  $('#aboutOk').onclick = function () { $('#about').classList.add('hidden'); };

  // 赞赏码
  const openReward = function () { $('#reward').classList.remove('hidden'); };
  if ($('#rewardOpen')) $('#rewardOpen').onclick = openReward;
  if ($('#rewardOpen2')) $('#rewardOpen2').onclick = openReward;
  $('#rewardClose').onclick = function () { $('#reward').classList.add('hidden'); };
  if (window.__REWARD__) $('#rewardImg').src = window.__REWARD__;

  // 左：女性化
  $('#cardFem').onclick = function () {
    S.mode = 'fem';
    enterStage();
  };

  // 右：颜值 → 先选性别
  $('#cardAtt').onclick = function () {
    S.mode = 'beauty';
    $('#genderPick').classList.remove('hidden');
  };
  document.querySelectorAll('[data-g]').forEach(function (b) {
    b.onclick = function () {
      S.gender = b.dataset.g;
      enterStage();
    };
  });

  // 取景页
  $('#backHome').onclick = goHome;
  $('#shoot').onclick = shoot;

  // 相册
  $('#pickFile').onclick = async function () {
    const h = $('#hintbar');
    try {
      if (!S.detOpts) { h.textContent = '正在装载模型…'; h.className = 'hint'; await ensureModels(); }
    } catch (e) { }
    const el = $('#file'); if (el) el.click();
  };

  $('#file').onchange = async function (e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const h = $('#hintbar');
    h.className = 'hint';
    try {
      if (!S.detOpts) { h.textContent = '正在装载模型…'; await ensureModels(); }
      h.textContent = '分析中…';
      await fromFile(f);
    } catch (err) {
      h.textContent = '分析失败：' + ((err && err.message) || err);
      h.className = 'hint bad';
    }
  };

  // 结果页
  $('#again').onclick = function () { enterStage(); };
  $('#toHome').onclick = goHome;

  const wipe = function () {
    closeCamera();
    const t = $('#thumb'); if (t) t.getContext('2d').clearRect(0, 0, t.width, t.height);
  };
  addEventListener('pagehide', wipe);
  addEventListener('beforeunload', wipe);
  document.addEventListener('visibilitychange', function () { if (document.hidden) closeCamera(); });
}
