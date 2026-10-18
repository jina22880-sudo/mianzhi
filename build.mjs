import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');
fs.mkdirSync(OUT, { recursive: true });

/* 1) 模型 → base64（内嵌，离线可用） */
// 优先从 npm 依赖取，仓库里不需要提交模型和第三方库
function resolveModelDir() {
  const cands = [
    path.join(ROOT, 'node_modules', '@vladmandic', 'face-api', 'model'),
    path.join(ROOT, 'assets', 'model'),
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('找不到 face-api 模型目录，先执行 npm install');
}
function resolveLib() {
  const cands = [
    path.join(ROOT, 'node_modules', '@vladmandic', 'face-api', 'dist', 'face-api.js'),
    path.join(ROOT, 'assets', 'face-api.js'),
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('找不到 face-api 库，先执行 npm install');
}
const modelDir = resolveModelDir();
// 只嵌用得上的两个模型，其余不要
const NEED = ['tiny_face_detector_model', 'face_landmark_68_model'];
const files = fs.readdirSync(modelDir).filter(f => NEED.some(n => f.startsWith(n)));
const models = {};
for (const f of files) {
  models[f] = fs.readFileSync(path.join(modelDir, f)).toString('base64');
}
console.log('模型内嵌:', files.join(', '), '→',
  (Object.values(models).reduce((a, b) => a + b.length, 0) / 1024).toFixed(0), 'KB(base64)');

/* 2) 自己的代码 → IIFE（esbuild 只打包 src/，face-api 是外部全局） */
const bundle = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src', 'app.js')],
  bundle: true,
  format: 'iife',
  globalName: 'FaceApp',
  minify: true,
  target: ['es2019'],
  write: false,
  legalComments: 'none',
});
const appJS = bundle.outputFiles[0].text;
console.log('业务代码:', (appJS.length / 1024).toFixed(0), 'KB');

/* 3) 组装 */
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const lib = fs.readFileSync(resolveLib(), 'utf8');
const modelsJS = 'window.__MODELS__=' + JSON.stringify(models) + ';';
const bootJS = appJS + '\n;try{FaceApp.boot();}catch(e){console.error(e);}';

const put = (src, code) => {
  const key = '/*' + src + '*/';
  const i = html.indexOf(key);
  if (i < 0) throw new Error('占位符找不到: ' + key);
  // ⚠️ 必须用函数替换，否则 $& 之类的会被当成特殊替换符
  return html.slice(0, i) + code + html.slice(i + key.length);
};

// ⚠️ 必须在 face-api 之前打好 fetch 补丁：它在初始化时就把 fetch 抓进闭包了
const patchJS = `
(function(){
  var M = window.__MODELS__ || {};
  var of = window.fetch ? window.fetch.bind(window) : null;
  function find(url){
    for (var k in M) if (url.indexOf(k) >= 0) return k;
    return null;
  }
  function decode(b64){
    var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  window.fetch = function(input, init){
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var k = find(url);
    if (k) {
      var isJson = k.length > 5 && k.slice(-5) === '.json';
      var body = isJson ? new TextDecoder().decode(decode(M[k])) : decode(M[k]);
      return Promise.resolve(new Response(body, {
        status: 200, headers: { 'Content-Type': isJson ? 'application/json' : 'application/octet-stream' }
      }));
    }
    return of ? of(input, init) : Promise.reject(new Error('no fetch'));
  };
})();`;
const rewardB64 = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT,'assets','reward.png')).toString('base64');
html = put('REWARD', 'window.__REWARD__=' + JSON.stringify(rewardB64) + ';');
html = put('PATCH', patchJS);
html = put('FACEAPI', lib);
html = put('MODELS', modelsJS);
html = put('APP', bootJS);

const outFile = path.join(OUT, '面值.html');
fs.writeFileSync(outFile, html);
console.log('html :', (html.length / 1048576).toFixed(2), 'MB ->', outFile);
