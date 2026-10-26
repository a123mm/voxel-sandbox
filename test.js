/* test.js — 用 jsdom 真跑页面,验证三种材质主题 + UI + 合成逻辑
 * 运行: node test.js                    (默认 round 原创圆润)
 *       THEME=pack node test.js         (手绘 CC0 材质包)
 *       THEME=classic node test.js      (Minetest CC 经典)
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const THEME = process.env.THEME || 'round';
const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, {
  pretendToBeVisual: true, runScripts: 'outside-only',
  url: 'http://127.0.0.1:8123/?theme=' + THEME,
});
const { window } = dom;
const { document } = window;

// ---------- 假 2D 画布(带调用计数)----------
const calls = { fillRect: 0, drawImage: 0, clearRect: 0 };
const fakeCtx = {
  imageSmoothingEnabled: false, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
  fillRect(){ calls.fillRect++; },
  drawImage(){ calls.drawImage++; },
  clearRect(){ calls.clearRect++; },
  beginPath(){}, moveTo(){}, lineTo(){}, closePath(){}, stroke(){}, fill(){},
  quadraticCurveTo(){}, arc(){}, save(){}, restore(){}, translate(){}, rotate(){}, scale(){},
};
window.HTMLCanvasElement.prototype.getContext = function(){ return fakeCtx; };
window.HTMLCanvasElement.prototype.toDataURL = function(){ return 'data:image/png;base64,'; };

// ---------- 假 Image(立即 onload)----------
window.Image = class {
  constructor(){ this.width = 128; this.height = 128; }
  set src(v){ this._s = v; setTimeout(() => this.onload && this.onload(), 0); }
  get src(){ return this._s; }
};

// ---------- 假 fetch(返回真实 manifest)----------
let manifest = null;
try { manifest = JSON.parse(fs.readFileSync('tex/pack/manifest.json', 'utf8')); } catch(e){}
window.fetch = function(url){
  if (String(url).indexOf('manifest.json') >= 0 && manifest) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(manifest) });
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
};

// ---------- 假 WebAudio ----------
const audioStats = { ctx:0, gain:0, buffer:0, src:0, osc:0 };
class FakeParam { constructor(){ this.value=0; } setValueAtTime(){ return this; } exponentialRampToValueAtTime(){ return this; } }
class FakeNode { constructor(){ this.gain=new FakeParam(); this.frequency=new FakeParam(); this.Q=new FakeParam(); this.type=''; } connect(){ return this; } disconnect(){} start(){} stop(){} }
window.AudioContext = class {
  constructor(){ this.sampleRate=8000; this.state='running'; this.destination={}; this.currentTime=0; audioStats.ctx++; }
  createGain(){ audioStats.gain++; return new FakeNode(); }
  createBuffer(c,l){ audioStats.buffer++; return { getChannelData(){ return new Float32Array(l); } }; }
  createBufferSource(){ audioStats.src++; return new FakeNode(); }
  createBiquadFilter(){ return new FakeNode(); }
  createOscillator(){ audioStats.osc++; return new FakeNode(); }
  resume(){ return Promise.resolve(); }
};

// ---------- 假 Screen Wake Lock ----------
const wake = { req: 0, rel: 0 };
Object.defineProperty(window.navigator, 'wakeLock', {
  configurable: true,
  value: {
    request(type){
      wake.req++;
      return Promise.resolve({
        released: false,
        release(){ this.released = true; wake.rel++; return Promise.resolve(); },
        addEventListener(){},
        type,
      });
    },
  },
});

// ---------- 假 THREE ----------
class V3 {
  constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
  copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; }
  clone(){ return new V3(this.x,this.y,this.z); }
  length(){ return Math.hypot(this.x,this.y,this.z); }
  normalize(){ const l=this.length()||1; this.x/=l; this.y/=l; this.z/=l; return this; }
  addScaledVector(v,k){ this.x+=v.x*k; this.y+=v.y*k; this.z+=v.z*k; return this; }
  add(v){ this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
  addScalar(k){ this.x+=k; this.y+=k; this.z+=k; return this; }
}
class Obj3 {
  constructor(){ this.position = new V3(); this.rotation = { order:'XYZ', set(){} };
    this.scale = new V3(1,1,1); this.children = []; this.visible = true; this.quaternion = {}; }
  add(o){ this.children.push(o); }
  remove(o){ const i=this.children.indexOf(o); if(i>=0) this.children.splice(i,1); }
  lookAt(){}
}
class Col {
  constructor(h){ this.r=1; this.g=1; this.b=1; if(typeof h==='number'){ this.r=((h>>16)&255)/255; this.g=((h>>8)&255)/255; this.b=(h&255)/255; } }
  copy(c){ this.r=c.r; this.g=c.g; this.b=c.b; return this; }
  lerp(c,t){ this.r+=(c.r-this.r)*t; this.g+=(c.g-this.g)*t; this.b+=(c.b-this.b)*t; return this; }
  setScalar(k){ this.r=this.g=this.b=k; return this; }
  setRGB(r,g,b){ this.r=r; this.g=g; this.b=b; return this; }
  getHex(){ return 0xffffff; }
  set(h){ return this; }
}
window.THREE = {
  Color: Col,
  Fog: class {},
  Scene: class extends Obj3 { constructor(){ super(); this.background=null; this.fog=null; } },
  PerspectiveCamera: class extends Obj3 { constructor(){ super(); this.aspect=1; } updateProjectionMatrix(){} },
  WebGLRenderer: class { constructor(){ this.domElement = document.createElement('canvas'); } setPixelRatio(){} setSize(){} render(){} },
  MeshBasicMaterial: class { constructor(o){ Object.assign(this,o||{}); this.color = (this.color instanceof Col) ? this.color : new Col(this.color===undefined?0xffffff:this.color); } },
  LineBasicMaterial: class { constructor(o){ Object.assign(this,o||{}); this.color = (this.color instanceof Col) ? this.color : new Col(this.color===undefined?0x000000:this.color); } },
  Mesh: class extends Obj3 { constructor(g,m){ super(); this.geometry=g; this.material=m; } },
  LineSegments: class extends Obj3 { constructor(g,m){ super(); this.geometry=g; this.material=m; } },
  BoxGeometry: class {}, EdgesGeometry: class {}, PlaneGeometry: class {},
  Points: class extends Obj3 { constructor(g,m){ super(); this.geometry=g; this.material=m; } },
  PointsMaterial: class { constructor(o){ Object.assign(this,o||{}); } },
  BufferGeometry: class { setAttribute(){} setIndex(){} dispose(){} },
  Float32BufferAttribute: class { constructor(a,n){ this.array=a; this.itemSize=n; } },
  CanvasTexture: class { constructor(){ this.needsUpdate=false; } },
  Vector3: V3,
  NearestFilter: 1003, LinearFilter: 1006, LinearMipmapLinearFilter: 1008, AdditiveBlending: 2,
  ClampToEdgeWrapping: 1001, DoubleSide: 2,
};

window.ontouchstart = null;

// ---------- 执行 game.js ----------
const game = fs.readFileSync('game.js', 'utf8');
// game.js 是严格模式,间接 eval 的 var 不会挂到 window,故在同一作用域里注入探针
try {
  window.eval(game);
} catch (e) {
  console.log('❌ game.js 执行异常:', e.message, '\n', e.stack);
  process.exit(1);
}

function tap(el, type) {
  el.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
}
let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✅ ' + name + (extra ? '  (' + extra + ')' : ''));
  else { console.log('  ❌ ' + name + (extra ? '  (' + extra + ')' : '')); fails++; }
}

const EXPECT = { round: 32, pack: 128, classic: 16 };

setTimeout(() => {
  const meta = window.__gameMeta || {};
  const P = { THEME: meta.theme, TILE_PX: meta.tilePx, atlasCanvas: meta.atlas };
  console.log('===== 0) 材质主题 [' + THEME + '] =====');
  check('THEME 正确', P.THEME === THEME, String(P.THEME));
  check('TILE_PX 正确', P.TILE_PX === EXPECT[THEME], 'TILE_PX=' + P.TILE_PX);

  console.log('===== 1) 启动游戏 =====');
  tap(document.getElementById('go'), 'click');

  setTimeout(() => {
    const P2 = { atlasCanvas: (window.__gameMeta||{}).atlas };
    console.log('===== 0b) 图集 =====');
    check('图集尺寸正确',
      P2.atlasCanvas && P2.atlasCanvas.width === EXPECT[THEME] && P2.atlasCanvas.height === EXPECT[THEME] * 15,
      P2.atlasCanvas ? P2.atlasCanvas.width + 'x' + P2.atlasCanvas.height : 'no canvas');
    if (THEME === 'round') {
      check('圆润贴图已绘制(fillRect 数)', calls.fillRect > 5000, 'fillRect=' + calls.fillRect);
    } else if (THEME === 'pack') {
      check('材质包图已叠加(drawImage 数)', calls.drawImage >= 11, 'drawImage=' + calls.drawImage);
    } else {
      check('经典图已叠加(drawImage 数)', calls.drawImage >= 8, 'drawImage=' + calls.drawImage);
    }

    console.log('===== 0c) 昼夜与天空 =====');
    const M = window.__gameMeta;
    M.time = 0.5; M.applySky();
    const noon = M.skyRgb(), noonStar = M.starAlpha();
    const noonBright = noon ? (noon[0]+noon[1]+noon[2]) / 3 : -1;
    M.time = 0.0; M.applySky();
    const night = M.skyRgb(), nightStar = M.starAlpha();
    const nightBright = night ? (night[0]+night[1]+night[2]) / 3 : -1;
    check('正午天空明亮', noonBright > 0.55, '亮度=' + noonBright.toFixed(2));
    check('午夜天空变暗', nightBright < 0.15, '亮度=' + nightBright.toFixed(2));
    check('白天没有星星', noonStar < 0.05, 'alpha=' + noonStar.toFixed(2));
    check('夜晚星星可见', nightStar > 0.8, 'alpha=' + nightStar.toFixed(2));
    M.time = 0.5;  const c12 = M.clock, p12 = M.phase;
    M.time = 0.25; const c6 = M.clock, p6 = M.phase;
    M.time = 0.0;  const c0 = M.clock, p0 = M.phase;
    check('时钟:正午 12:00', c12 === '12:00', c12 + ' / ' + p12);
    check('时钟:日出 06:00', c6 === '06:00', c6 + ' / ' + p6);
    check('时钟:午夜 00:00', c0 === '00:00', c0 + ' / ' + p0);
    check('时段名称正确', p12 === '正午' && p0 === '深夜', p12 + ',' + p0);

    console.log('===== 0i) 挖 / 放 =====');
    const hg = M.topAt(8, 8).h;
    M.setBlock(8, hg, 8, M.B.GRASS);
    M.setBlock(8, hg + 1, 8, 0);
    M.setBlock(8, hg + 2, 8, 0);
    M.flushMeshes();
    M.player.pos.set(8.5, hg + 1.0, 8.5);
    M.player.pitch = -1.45; M.player.yaw = 0;
    M.syncCamera();
    const invBefore = (M.inv[M.B.GRASS] || 0);
    M.dig();
    check('挖掉了脚下方块', M.getBlock(8, hg, 8) === 0, 'block=' + M.getBlock(8, hg, 8));
    check('挖掉后进背包', (M.inv[M.B.GRASS] || 0) === invBefore + 1, 'grass=' + M.inv[M.B.GRASS]);
    M.syncCamera();
    M.select(0);
    M.place();
    check('放回了方块', M.getBlock(8, hg, 8) !== 0, 'block=' + M.getBlock(8, hg, 8));
    check('放置后背包减少', (M.inv[M.B.GRASS] || 0) === invBefore, 'grass=' + M.inv[M.B.GRASS]);
    check('手机有挖/放按钮', !!document.getElementById('bBreak') && !!document.getElementById('bPlace'));

    console.log('===== 0k) 游泳 =====');
    const wx = 40, wz = 40;
    let wh = M.topAt(wx, wz).h;
    M.setBlock(wx, wh - 1, wz, M.B.STONE);
    M.setBlock(wx, wh, wz, M.B.WATER);
    M.setBlock(wx, wh + 1, wz, M.B.WATER);
    M.setBlock(wx, wh + 2, wz, 0);
    M.flushMeshes();
    const wxz = { x: wx, z: wz, h: wh };
    check('找到水域', !!wxz, wxz ? 'x=' + wxz.x + ' h=' + wxz.h : '无');
    if (wxz) {
      M.player.fly = false;
      M.player.pos.set(wxz.x + 0.5, wxz.h + 0.2, wxz.z + 0.5);
      M.player.vel.set(0, 0, 0);
      M.key('Space', false);
      M.tick(0.016);
      const vy0 = M.player.vel.y;
      M.key('Space', true);
      M.tick(0.016);
      const vy1 = M.player.vel.y;
      check('水里会缓慢下沉', vy0 < 0, 'vy=' + vy0.toFixed(2));
      check('按空格能上浮', vy1 > 0, 'vy=' + vy1.toFixed(2));
      check('游泳时在水里', M.inWater === true);
      M.key('Space', false);
    }

    console.log('===== 0l) 存档往返 =====');
    M.health = 13; M.setTimeOfDay(0.62);
    const hg2 = M.topAt(12, 12).h;
    M.setBlock(12, hg2 + 1, 12, M.B.BRICK);
    check('保存成功', M.save() === true);
    M.health = 20; M.setTimeOfDay(0.1);
    M.setBlock(12, hg2 + 1, 12, 0);
    check('读档成功', M.load() === true);
    check('读档恢复血量', M.health === 13, 'hp=' + M.health);
    check('读档恢复时间', Math.abs(M.time - 0.62) < 0.001, String(M.time));
    check('读档恢复方块改动', M.getBlock(12, hg2 + 1, 12) === M.B.BRICK,
      'block=' + M.getBlock(12, hg2 + 1, 12));

    console.log('===== 0j) 自适应画质 =====');
    check('模拟低帧率触发降画质', M.simLowFps(8).dropped === true);

    console.log('===== 0p) 台阶半砖 =====');
    const sx2 = 70, sz3 = 70, sy2 = M.topAt(sx2, sz3).h + 1;
    for (let yy = sy2; yy <= sy2 + 2; yy++) M.setBlock(sx2, yy, sz3, 0);
    M.setBlock(sx2, sy2, sz3, M.B.SLAB_STONE);
    M.flushMeshes();
    check('半砖已放置', M.getBlock(sx2, sy2, sz3) === M.B.SLAB_STONE);
    check('isSlab 判定正确', M.isSlab(M.B.SLAB_STONE) && M.isSlab(M.B.SLAB_WOOD) && !M.isSlab(M.B.STONE));
    check('脚陷进砖里会被挡', M.collidesBox(sx2 + 0.5, sy2 + 0.2, sz3 + 0.5, 0.3, 1.8) === true);
    check('站在砖面上不被挡', M.collidesBox(sx2 + 0.5, sy2 + 0.5, sz3 + 0.5, 0.3, 1.8) === false);
    check('半砖场景网格正常', M.chunkInfo(4, 4).built === true);
    M.openCraft();
    const craftTxt = document.getElementById('craft').textContent;
    const rowsN = document.querySelectorAll('#craft .recipe').length;
    check('工作台有 7 个配方(含两种台阶)', rowsN === 7, 'rows=' + rowsN);
    check('配方里有 3→6 的台阶合成', /×3\s*→\s*×6/.test(craftTxt), craftTxt.replace(/\s+/g, ' ').slice(0, 50));

    console.log('===== 0o) 被动生物 =====');
    const mob0 = M.mobSnapshot();
    check('世界里生成了生物', M.mobs > 0, '数量=' + M.mobs);
    check('羊和猪都有', mob0.some(m => m.type === 'sheep') && mob0.some(m => m.type === 'pig'),
      mob0.map(m => m.type).join(','));
    check('生物站在地面上', mob0.every(m => m.y > 0 && m.y < 32), JSON.stringify(mob0[0]));
    const pos0 = mob0.map(m => m.x + ',' + m.z).join('|');
    for (let i = 0; i < 40; i++) M.tickMobs(0.25);
    const mob1 = M.mobSnapshot();
    const pos1 = mob1.map(m => m.x + ',' + m.z).join('|');
    check('生物会走动', pos0 !== pos1);
    check('生物没掉出世界', mob1.every(m => m.y > -1 && m.y < 40), JSON.stringify(mob1[0]));
    const under = mob1.map(m => M.getBlock(Math.floor(m.x), Math.floor(m.y) - 1, Math.floor(m.z)));
    check('生物脚下有方块', under.every(b => b !== 0), under.join(','));

    console.log('===== 0n) 存档槽 / 性能面板 =====');
    check('默认 1 号槽', M.slot === 1 && M.saveKey === 'voxel_world_v3');
    M.useSlot(2);
    check('切到 2 号槽', M.slot === 2 && /_2$/.test(M.saveKey), M.saveKey);
    M.setBlock(14, M.topAt(14, 14).h + 1, 14, M.B.BRICK);
    check('2 号槽保存成功', M.save() === true);
    check('2 号槽写独立键', !!window.localStorage.getItem('voxel_world_v3_2'));
    M.useSlot(1);
    check('1 号槽键独立', M.saveKey === 'voxel_world_v3');
    check('2 号槽存档还在', !!window.localStorage.getItem('voxel_world_v3_2'));

    M.setPerf(true);
    check('性能面板可见', document.getElementById('perf').style.display === 'block');
    M.updatePerf();
    check('面板显示数据', /FPS|三角面/.test(document.getElementById('perf').textContent),
      document.getElementById('perf').textContent.slice(0, 50));
    M.setPerf(false);
    check('性能面板可关闭', document.getElementById('perf').style.display === 'none');

    console.log('===== 0m) 火把与灯光 =====');
    const th2 = M.topAt(30, 30).h;
    for (let yy = th2 + 1; yy <= th2 + 3; yy++) M.setBlock(30, yy, 30, 0);
    M.setBlock(30, th2, 30, M.B.STONE);
    M.setBlock(30, th2 + 1, 30, M.B.TORCH);
    M.flushMeshes();
    const lightNear = M.torchLightAt(30, th2 + 2, 30);
    check('火把点亮近处', lightNear > 0.8, 'light=' + lightNear.toFixed(2));
    check('12 格外无光', M.torchLightAt(30 + 13, th2 + 2, 30) === 0);
    check('火把有十字网格', M.chunkInfo(1, 1).plant === true);
    check('发光层已生成', M.chunkInfo(1, 1).glow === true);
    // 密封石盒:验证真正的遮挡/阴影
    const bx = 60, bz2 = 60, by = M.topAt(bx, bz2).h + 1;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy <= 3; dy++) {
      const edge = (Math.abs(dx) === 2 || Math.abs(dz) === 2 || dy === 0 || dy === 3);
      const isTorch = (dx === 0 && dz === 0 && dy === 1);
      M.setBlock(bx + dx, by + dy, bz2 + dz, edge ? M.B.STONE : (isTorch ? M.B.TORCH : 0));
    }
    M.flushMeshes();
    check('盒内有光', M.torchLightAt(bx, by + 1, bz2) > 0.85, 'v=' + M.torchLightAt(bx, by + 1, bz2).toFixed(2));
    check('盒外没有被照亮', M.torchLightAt(bx, by + 1, bz2 + 4) === 0,
      'v=' + M.torchLightAt(bx, by + 1, bz2 + 4).toFixed(2));
    M.setBlock(bx, by + 1, bz2 + 2, 0);   // 在墙上开一个洞
    M.flushMeshes();
    check('开洞后光漏出来', M.torchLightAt(bx, by + 1, bz2 + 4) > 0.2,
      'v=' + M.torchLightAt(bx, by + 1, bz2 + 4).toFixed(2));
    check('盒子背面仍然全黑', M.torchLightAt(bx, by + 1, bz2 - 4) === 0,
      'v=' + M.torchLightAt(bx, by + 1, bz2 - 4).toFixed(2));

    for (let zz = 31; zz <= 44; zz++) { M.setBlock(30, th2 + 1, zz, 0); M.setBlock(30, th2 + 2, zz, 0); }
    M.flushMeshes();
    const falloff = [1, 3, 6, 9, 11].map(d => M.torchLightAt(30, th2 + 1, 30 + d));
    check('光随距离单调衰减', falloff.every((v, i) => i === 0 || v <= falloff[i - 1] + 1e-9),
      falloff.map(v => v.toFixed(2)).join(' > '));
    check('远处归零', falloff[falloff.length - 1] < 0.2, 'v=' + falloff[falloff.length - 1].toFixed(2));

    const tim0 = Date.now();
    for (let i = 0; i < 10; i++) {
      M.setBlock(30, th2 + 1, 30, 0);
      M.setBlock(30, th2 + 1, 30, M.B.TORCH);
      M.torchLightAt(30, th2 + 2, 30);
    }
    const perMs = (Date.now() - tim0) / 10;
    check('光照重算开销可接受', perMs < 40, perMs.toFixed(1) + ' ms/次(含 2 次编辑)');

    console.log('===== 0h) 花草 =====');
    check('花草方块 id 正确', M.B.FLOWER === 15 && M.B.TALLGRASS === 16);
    const plantN = M.countPlants(2);
    check('世界里自然长出花草', plantN > 10, '2 半径内 ' + plantN + ' 株');
    check('花草不参与碰撞', M.solid(15) === false && M.solid(16) === false);
    const tp = M.topAt(8, 8);
    const fx = 8, fy = tp.h + 1, fz = 8;
    M.setBlock(fx, fy, fz, M.B.FLOWER);
    check('花可被射线选中', M.isTarget(fx, fy, fz) === true);
    check('花上方空气不可选中', M.isTarget(fx, fy + 3, fz) === false);
    M.flushMeshes();
    check('花草生成了独立网格', M.chunkInfo(0, 0).plant === true);
    M.setBlock(fx, fy, fz, 0); M.flushMeshes();

    console.log('===== 0f) 生命值 =====');
    M.health = 20;   // 前面的存档往返测试改过血量,先复原
    check('初始满血', M.health === 20, 'hp=' + M.health);
    const hearts = document.querySelectorAll('#hearts .hpb');
    check('血量 UI 有 10 颗心', hearts.length === 10, 'n=' + hearts.length);
    const fullW = [...document.querySelectorAll('#hearts .hpf')].map(e => e.style.width);
    check('满血时心是全满', fullW.every(w => w === '100%'), fullW.slice(0,3).join(','));
    M.hurt(5);
    check('受伤后扣血', M.health === 15, 'hp=' + M.health);
    const mixW = [...document.querySelectorAll('#hearts .hpf')].map(e => e.style.width);
    check('半颗心正确显示', mixW[7] === '50%' && mixW[6] === '100%', '7号=' + mixW[7] + ' 6号=' + mixW[6]);
    check('摔落伤害:3 格不掉血', M.fallDamage(3) === 0, String(M.fallDamage(3)));
    check('摔落伤害:6 格掉 2', M.fallDamage(6) === 2, String(M.fallDamage(6)));
    check('摔落伤害:20 格掉 16', M.fallDamage(20) === 16, String(M.fallDamage(20)));
    M.health = 0; M.hurt(1);
    check('0 血不会继续扣', M.health === 0, 'hp=' + M.health);
    M.respawn();
    check('重生回满血', M.health === 20, 'hp=' + M.health);

    console.log('===== 0e) 小地图 =====');
    const d0 = M.mapDraws;
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) M.drawMap();
    const dt5 = Date.now() - t0;
    check('小地图有绘制', M.mapDraws >= d0 + 5, 'draws=' + M.mapDraws);
    check('小地图绘制够快', dt5 < 400, '5 次耗时 ' + dt5 + 'ms');
    const top = M.topAt(8, 8);
    check('地表查询正常', top.h > 0 && top.h < 32 && top.b > 0, 'h=' + top.h + ' block=' + top.b);
    check('地表高度与小地图一致', top.h === M.topAt(8, 8).h);
    check('关闭/开启小地图', M.setMinimap(false) === false && M.setMinimap(true) === true);

    console.log('===== 0d) 音效 =====');
    check('AudioContext 已创建', audioStats.ctx >= 1, 'ctx=' + audioStats.ctx);
    const before = audioStats.osc;
    check('关闭音效', window.__gameMeta.toggleSound() === false);
    check('打开音效并播放提示音', window.__gameMeta.toggleSound() === true, 'osc +' + (audioStats.osc - before));

    console.log('===== 0g) 暂停菜单 =====');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { code:'Escape', bubbles:true }));
    check('ESC 打开暂停', M.paused === true && document.getElementById('pause').style.display === 'block');
    const pz = document.getElementById('pause');
    const btn = act => [...pz.querySelectorAll('button[data-act]')].find(b => b.getAttribute('data-act') === act);
    btn('time');  // 取时间按钮组第一个
    const noonBtn = [...pz.querySelectorAll('button[data-act="time"]')].find(b => b.getAttribute('data-v') === '0.5');
    noonBtn.dispatchEvent(new window.Event('click', { bubbles:true }));
    check('面板改时间:正午', Math.abs(M.time - 0.5) < 0.001, String(M.time));
    const rd0 = M.renderR;
    const rdPlus = [...pz.querySelectorAll('button[data-act="rd"]')].find(b => b.getAttribute('data-v') === '1');
    rdPlus.dispatchEvent(new window.Event('click', { bubbles:true }));
    check('面板调视距 +1', M.renderR === Math.min(5, rd0 + 1), 'rd=' + M.renderR);
    const mapBefore = M.minimapOn;
    btn('map').dispatchEvent(new window.Event('click', { bubbles:true }));
    check('面板开关小地图', M.minimapOn === !mapBefore);
    btn('map').dispatchEvent(new window.Event('click', { bubbles:true }));
    const sndBefore = M.soundOn;
    btn('sound').dispatchEvent(new window.Event('click', { bubbles:true }));
    check('面板开关音效', M.soundOn === !sndBefore);
    btn('sound').dispatchEvent(new window.Event('click', { bubbles:true }));
    check('导出存档不报错', typeof M.exportSave() === 'boolean');
    btn('resume').dispatchEvent(new window.Event('click', { bubbles:true }));
    check('继续游戏关闭面板', M.paused === false && document.getElementById('pause').style.display === 'none');
    check('开局已申请屏幕常亮', wake.req >= 1 && (M.wake === 'on' || M.wake === 'pending'), 'req=' + wake.req + ' state=' + M.wake);
    const offRet = M.setWakeLock(false);
    check('可关闭常亮', offRet === false && M.wake === 'off');
    const onRet = M.setWakeLock(true);
    check('可重新开启常亮', onRet === true && wake.req >= 2, 'req=' + wake.req + ' state=' + M.wake);
    document.dispatchEvent(new window.Event('pointerlockchange'));
    check('鼠标锁定丢失自动暂停', M.paused === true && document.getElementById('pause').style.display === 'block');
    M.togglePause();
    check('再次继续关闭', M.paused === false);

    console.log('===== 2) 打开背包 =====');
    tap(document.getElementById('bBag'), 'touchstart');
    const bag = document.getElementById('bag');
    check('背包面板可见', bag.style.display === 'block');
    const bigs = bag.querySelectorAll('.bigbtn');
    check('存在绿色大按钮', bigs.length >= 1, '数量=' + bigs.length);
    check('按钮文字含 木板/工作台', /木板×4/.test(bag.textContent) && /工作台/.test(bag.textContent));
    check('背包里有火把配方', /火把×4/.test(bag.textContent));
    check('显示当前持有', /当前持有/.test(bag.textContent), bag.textContent.slice(0, 60));

    console.log('===== 3) 点"木板×4 → 工作台" =====');
    let target = null;
    for (const b of bigs) if (/工作台/.test(b.textContent)) target = b;
    check('找到工作台按钮', !!target, target ? target.textContent : '');
    if (target) {
      tap(target, 'pointerdown');
      const after = document.getElementById('bag').textContent;
      check('合成后出现工作台', /工作台×1/.test(after), after.replace(/\s+/g, ' ').slice(0, 80));
      check('木板数量减少', /木板×4/.test(after));
    }

    console.log('===== 4) 补给按钮 =====');
    const supBtn = [...document.querySelectorAll('#bag .cclose')].find(e => /补给/.test(e.textContent));
    check('存在补给按钮', !!supBtn);
    if (supBtn) { tap(supBtn, 'pointerdown'); check('补给后背包有木板', /木板×8/.test(document.getElementById('bag').textContent)); }

    const errPanel = document.getElementById('err');
    check('全程无 JS 报错', !errPanel || errPanel.style.display !== 'block',
      errPanel ? String(errPanel.textContent).slice(0, 80) : '');
    finish();
  }, 400);
}, 150);

function report(){
  console.log('\n' + (fails ? '❌ [' + THEME + '] 有 ' + fails + ' 项失败' : '🎉 [' + THEME + '] 全部通过'));
  process.exit(fails ? 1 : 0);
}

// SOAK=1 时多跑 4 秒主循环,检查长时间运行是否稳定
function finish(){
  if (!process.env.SOAK) return report();
  const M = window.__gameMeta;
  console.log('===== 0z) 长时间运行(4 秒) =====');
  M.health = 20;
  M.player.pos.set(M.spawn.x, M.spawn.y, M.spawn.z);
  M.key('KeyW', true);
  const startQ = M.meshQueueLen;
  setTimeout(() => {
    M.key('KeyW', false);
    const errPanel = document.getElementById('err');
    check('运行 4 秒无报错', !errPanel || errPanel.style.display !== 'block',
      errPanel ? String(errPanel.textContent).slice(0, 80) : '');
    check('网格队列已消化', M.meshQueueLen === 0, '起点=' + startQ + ' 现在=' + M.meshQueueLen);
    const info = document.getElementById('info').textContent;
    check('主循环在跑', /FPS \d+/.test(info), info.slice(0, 46));
    check('玩家在地面以上', M.player.pos.y > 0, 'y=' + M.player.pos.y.toFixed(1));
    report();
  }, 4000);
}
