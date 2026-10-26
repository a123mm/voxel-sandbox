/* 方块世界 Voxel Sandbox v3 — 无限区块流式世界
 * 原创体素沙盒;材质:程序化 + Minetest 默认材质(CC BY-SA 3.0)
 */
(function () {
'use strict';

var CHUNK=16, HEIGHT=32, WATER_LEVEL=8, RENDER_R=3, LOAD_R=RENDER_R+2;
var B={ AIR:0, GRASS:1, DIRT:2, STONE:3, SAND:4, WATER:5, WOOD:6, LEAVES:7, PLANK:8, COAL:9, IRON:10, COBBLE:11, CRAFT:12, BRICK:13, GLASS:14, FLOWER:15, TALLGRASS:16, TORCH:17, SLAB_STONE:18, SLAB_WOOD:19 };
var NON_OPAQUE={}; NON_OPAQUE[B.WATER]=1; NON_OPAQUE[B.GLASS]=1; NON_OPAQUE[B.FLOWER]=1; NON_OPAQUE[B.TALLGRASS]=1; NON_OPAQUE[B.TORCH]=1;
var SOLID={};
[B.GRASS,B.DIRT,B.STONE,B.SAND,B.WOOD,B.LEAVES,B.PLANK,B.COAL,B.IRON,B.COBBLE,B.CRAFT,B.BRICK,B.GLASS,
 B.SLAB_STONE,B.SLAB_WOOD].forEach(function(b){SOLID[b]=1;});
var NAMES={}; NAMES[B.GRASS]='草'; NAMES[B.DIRT]='土'; NAMES[B.STONE]='石'; NAMES[B.SAND]='沙';
NAMES[B.WOOD]='木'; NAMES[B.LEAVES]='叶'; NAMES[B.PLANK]='木板'; NAMES[B.COAL]='煤'; NAMES[B.IRON]='铁'; NAMES[B.COBBLE]='圆石'; NAMES[B.CRAFT]='工作台'; NAMES[B.BRICK]='石砖'; NAMES[B.GLASS]='玻璃';
NAMES[B.FLOWER]='花'; NAMES[B.TALLGRASS]='草'; NAMES[B.TORCH]='火把'; NAMES[B.SLAB_STONE]='石台阶'; NAMES[B.SLAB_WOOD]='木台阶';
var PLACEABLE=[B.GRASS,B.DIRT,B.STONE,B.SAND,B.WOOD,B.LEAVES,B.PLANK,B.COAL,B.COBBLE,B.CRAFT,B.BRICK,B.GLASS,B.FLOWER,B.TALLGRASS,B.TORCH,B.SLAB_STONE,B.SLAB_WOOD];
var HOTBAR_SIZE=9;
var hotSlots=[B.GRASS,B.DIRT,B.STONE,B.SAND,B.WOOD,B.LEAVES,B.PLANK,B.COBBLE,B.CRAFT];
var selected=0, SAVE_KEY='voxel_world_v3', SLOT_KEY='voxel_slot', slotN=1;
function useSlot(n){
  slotN=Math.max(1,Math.min(3,n));
  SAVE_KEY=(slotN===1)?'voxel_world_v3':('voxel_world_v3_'+slotN);
  try{ localStorage.setItem(SLOT_KEY,String(slotN)); }catch(e){}
  return slotN;
}
// 旧版单存档(voxel_world_v3)自动迁移到 1 号槽
try{
  var _oldSave=localStorage.getItem('voxel_world_v3');
  var _savedSlot=parseInt(localStorage.getItem(SLOT_KEY)||'1',10)||1;
  if(_oldSave && !localStorage.getItem('voxel_world_v3_2') && !localStorage.getItem('voxel_world_v3_3') && _savedSlot===1){ /* 1 号槽就是旧键 */ }
  useSlot(_savedSlot);
}catch(e){ useSlot(1); }
var inv = {};                                  // 背包:方块类型 -> 数量
function invCount(t){ return inv[t]||0; }
function invAdd(t,n){ inv[t]=invCount(t)+n; updateHotbar(); }
function invTake(t,n){ if(invCount(t)<n) return false; inv[t]-=n; updateHotbar(); return true; }
var RECIPES = [
  { in:{ 6:1 }, out:{ 8:4 },  basic:true },    // 木 -> 木板×4(背包里可做)
  { in:{ 8:4 }, out:{ 12:1 }, basic:true },    // 木板×4 -> 工作台(背包里可做)
  { in:{ 11:4 }, out:{ 13:1 } },               // 圆石×4 -> 石砖(需工作台)
  { in:{ 4:4 }, out:{ 14:1 } },                // 沙×4 -> 玻璃(需工作台)
  { in:{ 6:1, 9:1 }, out:{ 17:4 }, basic:true },   // 木×1 + 煤×1 -> 火把×4
  { in:{ 11:3 }, out:{ 18:6 } },                 // 圆石×3 -> 石台阶×6(需工作台)
  { in:{ 8:3 }, out:{ 19:6 } }                   // 木板×3 -> 木台阶×6(需工作台)
];

// ===================== 噪声 =====================
function hash2(x,z,s){var h=Math.imul(x|0,374761393)+Math.imul(z|0,668265263)+Math.imul(s|0,1442695041);h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return ((h>>>0)/4294967295)*2-1;}
function hash3(x,y,z,s){var h=Math.imul(x|0,374761393)+Math.imul(y|0,1103515245)+Math.imul(z|0,668265263)+Math.imul(s|0,1442695041);h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return ((h>>>0)/4294967295)*2-1;}
function smooth(t){return t*t*(3-2*t);}
function vnoise2(x,z,s){var xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi;
  var a=hash2(xi,zi,s),b=hash2(xi+1,zi,s),c=hash2(xi,zi+1,s),d=hash2(xi+1,zi+1,s);
  var u=smooth(xf),v=smooth(zf);return (a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v;}
function vnoise3(x,y,z,s){var xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);
  var xf=x-xi,yf=y-yi,zf=z-zi,u=smooth(xf),v=smooth(yf),w=smooth(zf);
  function L(a,b,t){return a+(b-a)*t;}
  return L(L(L(hash3(xi,yi,zi,s),hash3(xi+1,yi,zi,s),u),L(hash3(xi,yi+1,zi,s),hash3(xi+1,yi+1,zi,s),u),v),
           L(L(hash3(xi,yi,zi+1,s),hash3(xi+1,yi,zi+1,s),u),L(hash3(xi,yi+1,zi+1,s),hash3(xi+1,yi+1,zi+1,s),u),v),w);}
function fbm2(x,z,s,oct){var sum=0,amp=0.5,f=1;for(var i=0;i<oct;i++){sum+=vnoise2(x*f,z*f,s+i*101)*amp;amp*=0.5;f*=2;}return sum;}

// ===================== 地形高度(确定性,区块拼接一致) =====================
function terrainAt(x,z){
  var cont=fbm2(x/26,z/26,1337,4), hill=fbm2(x/11,z/11,7331,3), bio=fbm2(x/40,z/40,99,2);
  var desert=(bio>0.28);
  var h=Math.floor(12+cont*6.5+hill*2.5);
  if(h<3)h=3; if(h>HEIGHT-6)h=HEIGHT-6;
  return {h:h,desert:desert};
}

// ===================== 区块 =====================
var chunkCache=new Map();     // key -> {cx,cz,blocks,mesh,water,built}
var edits=new Map();          // chunkKey -> Map("lx,ly,lz" -> block)
var meshQueue=[], meshQueued=new Set();

function ckey(cx,cz){ return cx+','+cz; }
function localIdx(lx,ly,lz){ return (ly*CHUNK+lz)*CHUNK+lx; }

function genChunk(cx,cz){
  var arr=new Uint8Array(CHUNK*CHUNK*HEIGHT);
  function set(lx,y,lz,v){ if(lx<0||lx>=CHUNK||lz<0||lz>=CHUNK||y<0||y>=HEIGHT) return; arr[localIdx(lx,y,lz)]=v; }
  var x0=cx*CHUNK, z0=cz*CHUNK, lx,lz,y;
  for(lx=0;lx<CHUNK;lx++) for(lz=0;lz<CHUNK;lz++){
    var x=x0+lx, z=z0+lz, tr=terrainAt(x,z), h=tr.h;
    for(y=0;y<=h;y++){
      var t;
      if(y===h) t=(h<=WATER_LEVEL+1||tr.desert)?B.SAND:B.GRASS;
      else if(y>h-3) t=(h<=WATER_LEVEL+1||tr.desert)?B.SAND:B.DIRT;
      else{
        t=B.STONE;
        var r=hash3(x,y,z,2468);
        if(r>0.935 && y<h-3) t=B.COAL;
        else if(r<-0.962 && y<h-5) t=B.IRON;
      }
      if(y>1 && y<h-1){
        var cav=vnoise3(x/13,y/8,z/13,555)*0.65+vnoise3(x/6,y/5,z/6,777)*0.35;
        if(cav>0.46) continue;
      }
      set(lx,y,lz,t);
    }
    for(y=h+1;y<=WATER_LEVEL;y++) set(lx,y,lz,B.WATER);
  }
  // 花草(只长在草地表面)
  for(lx=0;lx<CHUNK;lx++) for(lz=0;lz<CHUNK;lz++){
    var gx=x0+lx, gz=z0+lz, gtr=terrainAt(gx,gz), gh=gtr.h;
    if(gh<=WATER_LEVEL || gtr.desert) continue;
    if(arr[localIdx(lx,gh,lz)]!==B.GRASS) continue;
    if(gh+1>=HEIGHT || arr[localIdx(lx,gh+1,lz)]!==B.AIR) continue;
    var rr=hash2(gx,gz,9001);
    if(rr>0.955) set(lx,gh+1,lz,B.FLOWER);
    else if(rr>0.80) set(lx,gh+1,lz,B.TALLGRASS);
  }
  // 树(扫描 3×3 邻区块的候选点,保证跨区块一致)
  function stampTree(wx,wz){
    var tr=terrainAt(wx,wz); if(tr.desert) return;
    var h=tr.h; if(h<=WATER_LEVEL) return;
    var th=4+Math.floor((hash2(wx,wz,7)+1)*2);
    for(var k=1;k<=th;k++) set(wx-x0,h+k,wz-z0,B.WOOD);
    var top=h+th;
    for(var dx=-2;dx<=2;dx++) for(var dz=-2;dz<=2;dz++) for(var dy=-1;dy<=1;dy++){
      if(Math.abs(dx)+Math.abs(dz)+Math.abs(dy)>3) continue;
      var tx=wx+dx, tz=wz+dz, ltx=tx-x0, ltz=tz-z0;
      if(ltx<0||ltx>=CHUNK||ltz<0||ltz>=CHUNK) continue;
      if(arr[localIdx(ltx,top+dy,ltz)]===B.AIR) set(ltx,top+dy,ltz,B.LEAVES);
    }
  }
  for(var dcx=-1;dcx<=1;dcx++) for(var dcz=-1;dcz<=1;dcz++){
    var bx=(cx+dcx)*CHUNK, bz=(cz+dcz)*CHUNK;
    for(var tx=0;tx<CHUNK;tx++) for(var tz=0;tz<CHUNK;tz++){
      var wx=bx+tx, wz=bz+tz;
      if(hash2(wx*7,wz*13,42)>=0.984) stampTree(wx,wz);
    }
  }
  // 应用玩家修改
  var m=edits.get(ckey(cx,cz));
  if(m) m.forEach(function(v,k){ var p=k.split(','); set(+p[0],+p[1],+p[2],v); });
  return arr;
}

// 每列"最上面一个非空气方块",供小地图/出生点等用(区块级缓存)
function ensureTop(c){
  if(c.topH) return;
  c.topH=new Int16Array(CHUNK*CHUNK);
  c.topB=new Uint8Array(CHUNK*CHUNK);
  for(var lx=0;lx<CHUNK;lx++) for(var lz=0;lz<CHUNK;lz++){
    var i=lz*CHUNK+lx, h=-1, b=0;
    for(var y=HEIGHT-1;y>=0;y--){
      var t=c.blocks[(y*CHUNK+lz)*CHUNK+lx];
      if(t!==B.AIR){ h=y; b=t; break; }
    }
    c.topH[i]=h; c.topB[i]=b;
  }
}
function topAt(x,z){
  var cx=Math.floor(x/CHUNK), cz=Math.floor(z/CHUNK);
  var c=getChunk(cx,cz);
  ensureTop(c);
  var i=(z-cz*CHUNK)*CHUNK+(x-cx*CHUNK);
  return {h:c.topH[i], b:c.topB[i]};
}

// ===================== 方块光照(BFS 泛光:可绕墙、有遮挡、逐级衰减)=====================
var LIGHT_MAX=13, LIGHT_PAD=13, LIGHT_W=CHUNK+2*LIGHT_PAD;
var torchListCache=new Map();
var _lTmp=null, _lOpaque=null, _lBuckets=null;
var _lSeedsX=[], _lSeedsY=[], _lSeedsZ=[];
function lidx(px,py,pz){ return (py*LIGHT_W+pz)*LIGHT_W+px; }
function _lightInit(){
  if(_lTmp) return;
  _lTmp=new Uint8Array(LIGHT_W*LIGHT_W*HEIGHT);
  _lOpaque=new Uint8Array(LIGHT_W*LIGHT_W*HEIGHT);
  _lBuckets=[]; for(var i=0;i<=LIGHT_MAX;i++) _lBuckets.push([]);
}
function torchListAt(cx,cz){
  var k=ckey(cx,cz), l=torchListCache.get(k);
  if(l!==undefined) return l;
  var c=getChunk(cx,cz), out=[];
  for(var lx=0;lx<CHUNK;lx++) for(var lz=0;lz<CHUNK;lz++){
    for(var y=0;y<HEIGHT;y++){
      if(c.blocks[(y*CHUNK+lz)*CHUNK+lx]===B.TORCH) out.push(cx*CHUNK+lx, y, cz*CHUNK+lz);
    }
  }
  torchListCache.set(k,out);
  return out;
}
function nearTorch(x,y,z,r){
  var rr=r||LIGHT_MAX, cx=Math.floor(x/CHUNK), cz=Math.floor(z/CHUNK);
  for(var dcx=-1;dcx<=1;dcx++) for(var dcz=-1;dcz<=1;dcz++){
    var l=torchListAt(cx+dcx,cz+dcz);
    for(var i=0;i<l.length;i+=3){
      if(Math.max(Math.abs(l[i]-x),Math.abs(l[i+1]-y),Math.abs(l[i+2]-z))<=rr) return true;
    }
  }
  return false;
}
// 计算某区块的方块光照(只在附近有火把时才算)
function computeChunkLight(cx,cz){
  var out=new Uint8Array(CHUNK*CHUNK*HEIGHT);
  _lSeedsX.length=0; _lSeedsY.length=0; _lSeedsZ.length=0;
  for(var dcx=-1;dcx<=1;dcx++) for(var dcz=-1;dcz<=1;dcz++){
    var l=torchListAt(cx+dcx,cz+dcz);
    for(var i=0;i<l.length;i+=3){ _lSeedsX.push(l[i]); _lSeedsY.push(l[i+1]); _lSeedsZ.push(l[i+2]); }
  }
  if(!_lSeedsX.length) return out;      // 附近没火把:整块为 0,零开销
  _lightInit();
  _lTmp.fill(0); _lOpaque.fill(0);
  for(var b=0;b<=LIGHT_MAX;b++) _lBuckets[b].length=0;
  var x0=cx*CHUNK-LIGHT_PAD, z0=cz*CHUNK-LIGHT_PAD;
  // 把 3×3 区块的方块栅格拷进带边界的临时数组
  for(var dcx2=-1;dcx2<=1;dcx2++) for(var dcz2=-1;dcz2<=1;dcz2++){
    var c=getChunk(cx+dcx2,cz+dcz2);
    var bx=(cx+dcx2)*CHUNK, bz=(cz+dcz2)*CHUNK;
    var wx0=Math.max(bx,x0), wx1=Math.min(bx+CHUNK,x0+LIGHT_W);
    var wz0=Math.max(bz,z0), wz1=Math.min(bz+CHUNK,z0+LIGHT_W);
    for(var wx=wx0;wx<wx1;wx++){
      var px=wx-x0, lbx=wx-bx;
      for(var wz=wz0;wz<wz1;wz++){
        var pz=wz-z0, lbz=wz-bz, base=(lbx+lbz*CHUNK);
        for(var y=0;y<HEIGHT;y++){
          var blk=c.blocks[y*CHUNK*CHUNK+base];
          _lOpaque[lidx(px,y,pz)]=(blk && blk!==B.AIR && blk!==B.WATER && blk!==B.GLASS && !isPlant(blk))?1:0;
        }
      }
    }
  }
  // 火把作为光源
  for(var s2=0;s2<_lSeedsX.length;s2++){
    var spx=_lSeedsX[s2]-x0, spz=_lSeedsZ[s2]-z0, spy=_lSeedsY[s2];
    if(spx<0||spx>=LIGHT_W||spz<0||spz>=LIGHT_W||spy<0||spy>=HEIGHT) continue;
    var si=lidx(spx,spy,spz);
    if(_lOpaque[si]) continue;
    if(_lTmp[si]<LIGHT_MAX){ _lTmp[si]=LIGHT_MAX; _lBuckets[LIGHT_MAX].push(si); }
  }
  // 逐级 BFS
  var W2=LIGHT_W*LIGHT_W, W3=W2*LIGHT_W;
  for(var lvl=LIGHT_MAX;lvl>=1;lvl--){
    var bk=_lBuckets[lvl];
    for(var qi=0;qi<bk.length;qi++){
      var cur=bk[qi];
      if(_lTmp[cur]!==lvl) continue;
      var cz3=(cur/W2)|0, rem=cur-cz3*W2, pz3=(rem/LIGHT_W)|0, px3=rem-pz3*LIGHT_W;
      var next=lvl-1, nb, nx, ny, nz;
      // -x
      if(px3>0){ nb=cur-1; if(!_lOpaque[nb] && _lTmp[nb]<next){ _lTmp[nb]=next; _lBuckets[next].push(nb); } }
      if(px3<LIGHT_W-1){ nb=cur+1; if(!_lOpaque[nb] && _lTmp[nb]<next){ _lTmp[nb]=next; _lBuckets[next].push(nb); } }
      if(pz3>0){ nb=cur-LIGHT_W; if(!_lOpaque[nb] && _lTmp[nb]<next){ _lTmp[nb]=next; _lBuckets[next].push(nb); } }
      if(pz3<LIGHT_W-1){ nb=cur+LIGHT_W; if(!_lOpaque[nb] && _lTmp[nb]<next){ _lTmp[nb]=next; _lBuckets[next].push(nb); } }
      if(cz3>0){ nb=cur-W2; if(!_lOpaque[nb] && _lTmp[nb]<next){ _lTmp[nb]=next; _lBuckets[next].push(nb); } }
      if(cz3<HEIGHT-1){ nb=cur+W2; if(!_lOpaque[nb] && _lTmp[nb]<next){ _lTmp[nb]=next; _lBuckets[next].push(nb); } }
    }
  }
  // 取回中心区块
  for(var lx=0;lx<CHUNK;lx++) for(var lz=0;lz<CHUNK;lz++){
    var o=(lz*CHUNK+lx);
    for(var ly=0;ly<HEIGHT;ly++) out[ly*CHUNK*CHUNK+o]=_lTmp[lidx(lx+LIGHT_PAD,ly,lz+LIGHT_PAD)];
  }
  return out;
}
function ensureLight(c){
  if(!c.light) c.light=computeChunkLight(c.cx,c.cz);
  return c.light;
}
function lightAt(x,y,z){
  if(y<0||y>=HEIGHT) return 0;
  var cx=Math.floor(x/CHUNK), cz=Math.floor(z/CHUNK);
  var c=getChunk(cx,cz);
  return ensureLight(c)[(y*CHUNK+(z-cz*CHUNK))*CHUNK+(x-cx*CHUNK)];
}
function torchLightAt(x,y,z){ return lightAt(x,y,z)/LIGHT_MAX; }

function getChunk(cx,cz){
  var k=ckey(cx,cz), c=chunkCache.get(k);
  if(c) return c;
  c={cx:cx,cz:cz,blocks:genChunk(cx,cz),mesh:null,water:null,glassMesh:null,plant:null,glow:null,light:null,built:false};
  chunkCache.set(k,c);
  return c;
}
function getBlock(x,y,z){
  if(y<0||y>=HEIGHT) return B.AIR;
  var cx=Math.floor(x/CHUNK), cz=Math.floor(z/CHUNK);
  var c=getChunk(cx,cz);
  return c.blocks[localIdx(x-cx*CHUNK,y,z-cz*CHUNK)];
}
function setBlock(x,y,z,v){
  if(y<0||y>=HEIGHT) return;
  var cx=Math.floor(x/CHUNK), cz=Math.floor(z/CHUNK), c=getChunk(cx,cz);
  var lx=x-cx*CHUNK, lz=z-cz*CHUNK;
  var oldT=c.blocks[localIdx(lx,y,lz)];
  c.blocks[localIdx(lx,y,lz)]=v;
  c.topH=null;
  torchListCache.delete(ckey(cx,cz));
  c.light=null;
  // 火把增删、或改动点在光照范围内:邻近区块的光也要重算
  if(oldT===B.TORCH || v===B.TORCH || nearTorch(x,y,z,LIGHT_MAX+2)){
    for(var ldx=-1;ldx<=1;ldx++) for(var ldz=-1;ldz<=1;ldz++){
      var lc=getChunk(cx+ldx,cz+ldz); lc.light=null; queueMesh(cx+ldx,cz+ldz);
    }
  }
  var k=ckey(cx,cz), m=edits.get(k); if(!m){m=new Map();edits.set(k,m);}
  m.set(lx+','+y+','+lz, v);
  queueMesh(cx,cz);
  if(lx===0) queueMesh(cx-1,cz);
  if(lx===CHUNK-1) queueMesh(cx+1,cz);
  if(lz===0) queueMesh(cx,cz-1);
  if(lz===CHUNK-1) queueMesh(cx,cz+1);
}

// ===================== 贴图 =====================
// 主题:round = 原创圆润(默认) / pack = 手绘 CC0 材质包 / classic = Minetest CC 材质
var THEME=(function(){
  var t='round';
  try{ var m=/[?&]theme=([a-z0-9_]+)/i.exec(String((typeof location!=='undefined'&&location.search)||'')); if(m) t=m[1].toLowerCase(); }catch(e){}
  return (t==='classic'||t==='pack')?t:'round';
})();
// 供测试/调试读取(严格模式下 eval 的 var 不会挂到 window)
try{ if(typeof window!=='undefined') window.__gameMeta={
  get theme(){return THEME;}, get tilePx(){return TILE_PX;}, get atlas(){return atlasCanvas;},
  get time(){return worldTime;}, set time(v){worldTime=v;},
  get clock(){return clockText();}, get phase(){return dayPhase();},
  get sound(){return {on:soundOn, ctx:!!AC};},
  toggleSound:function(){return toggleSound();},
  applySky:function(){updateSky(0);},
  skyRgb:function(){ if(!scene||!scene.background) return null;
    var c=scene.background; return [c.r,c.g,c.b]; },
  starAlpha:function(){ return starsPts?starsPts.material.opacity:-1; },
  get mapDraws(){return mapDraws;}, drawMap:function(){drawMinimap();},
  setMinimap:function(on){return setMinimap(on);},
  topAt:function(x,z){return topAt(x,z);},
  get health(){return health;}, set health(v){health=v; heartsUi();},
  get air(){return airSec;},
  hurt:function(n){hurt(n||1,'测试');},
  respawn:function(){respawn();},
  fallDamage:fallDamage,
  get spawn(){return {x:spawnPt.x,y:spawnPt.y,z:spawnPt.z};},
  get paused(){return paused;},
  get renderR(){return RENDER_R;},
  get minimapOn(){return minimapOn;},
  get soundOn(){return soundOn;},
  togglePause:function(){togglePause();},
  setRenderDist:setRenderDist, exportSave:exportSave, setTimeOfDay:setTimeOfDay,
  get qualityDropped(){return qualityDropped;},
  simLowFps:function(times){ fps=10; for(var i=0;i<(times||8);i++) adaptQuality(); return {dropped:qualityDropped, lowFps:lowFps}; },
  B:B, isTarget:function(x,y,z){return isTarget(x,y,z);}, solid:function(t){return SOLID[t]===1;},
  countPlants:function(rr){ var n=0, r2=rr||2;
    for(var cx=-r2;cx<=r2;cx++) for(var cz=-r2;cz<=r2;cz++){
      var ch=getChunk(cx,cz);
      for(var i=0;i<ch.blocks.length;i++){ var tv=ch.blocks[i]; if(tv===B.FLOWER||tv===B.TALLGRASS) n++; }
    }
    return n; },
  chunkInfo:function(cx,cz){ var ch=getChunk(cx,cz); return {plant:!!ch.plant, glow:!!ch.glow, mesh:!!ch.mesh, built:!!ch.built}; },
  flushMeshes:function(){ while(meshQueue.length) flushMeshQueue(64); },
  setBlock:function(x,y,z,v){setBlock(x,y,z,v);},
  get player(){return player;},
  syncCamera:function(){ camera.position.set(player.pos.x,player.pos.y+EYE,player.pos.z);
    camera.rotation.set(player.pitch,player.yaw,0,'YXZ'); },
  dig:function(){doBreak();}, place:function(){doPlace();},
  look:function(){return raycast(6);},
  get inWater(){ var p=player.pos; return getBlock(Math.floor(p.x),Math.floor(p.y+0.9),Math.floor(p.z))===B.WATER; },
  get meshQueueLen(){return meshQueue.length;},
  torchLightAt:function(x,y,z){return torchLightAt(x,y,z);},
  get wake(){return wakeState();}, setWakeLock:setWakeLock,
  get perfOn(){return perfOn;}, setPerf:setPerf,
  get slot(){return slotN;}, useSlot:useSlot, get saveKey(){return SAVE_KEY;},
  updatePerf:function(){updatePerf();},
  get mobs(){return mobs.length;}, mobSnapshot:function(){
    return mobs.map(function(m){return {type:m.type,x:+m.x.toFixed(2),y:+m.y.toFixed(2),z:+m.z.toFixed(2)};}); },
  tickMobs:function(dt){updateMobs(dt||0.2);},
  isSlab:function(t){return isSlab(t);}, openCraft:function(){openCraft();},
  collidesBox:function(x,y,z,h,ht){return collidesBox(x,y,z,h,ht);},
  key:function(c,d){keys[c]=!!d;}, tick:function(dt){updatePlayer(dt||0.016);},
  save:function(){return saveGame(true);}, load:function(){return loadGame();},
  select:function(i){selectSlot(i);},
  get inv(){return inv;},
  get sel(){return selected;},
  getBlock:function(x,y,z){return getBlock(x,y,z);}
}; }catch(e){}
var THEME_NAME={round:'原创圆润',pack:'手绘 CC0',classic:'经典 CC'};
var THEME_NEXT={round:'pack',pack:'classic',classic:'round'};
function cycleTheme(){
  var t=THEME_NEXT[THEME]||'round';
  try{ if(typeof saveGame==='function'){ try{ saveGame(); }catch(e){} } }catch(e){}
  try{
    var base=String((typeof location!=='undefined'&&location.pathname)||'index.html');
    location.href=(t==='round')?base:(base+'?theme='+t);
  }catch(e){}
}
var TILES=15, TILE_PX=(THEME==='pack'?128:(THEME==='classic'?16:32)), atlasCanvas=null, atlasTex=null;
var TILE_OF={};
TILE_OF[B.GRASS]={top:0,side:1,bottom:2};
TILE_OF[B.DIRT]={top:2,side:2,bottom:2};
TILE_OF[B.STONE]={top:3,side:3,bottom:3};
TILE_OF[B.SAND]={top:4,side:4,bottom:4};
TILE_OF[B.WOOD]={top:8,side:5,bottom:8};
TILE_OF[B.LEAVES]={top:6,side:6,bottom:6};
TILE_OF[B.PLANK]={top:7,side:7,bottom:7};
TILE_OF[B.COAL]={top:9,side:9,bottom:9};
TILE_OF[B.IRON]={top:10,side:10,bottom:10};
TILE_OF[B.COBBLE]={top:11,side:11,bottom:11};
TILE_OF[B.CRAFT]={top:12,side:12,bottom:12};
TILE_OF[B.BRICK]={top:13,side:13,bottom:13};
TILE_OF[B.GLASS]={top:14,side:14,bottom:14};
TILE_OF[B.SLAB_STONE]={top:11,side:11,bottom:11};
TILE_OF[B.SLAB_WOOD]={top:7,side:7,bottom:7};
var CORNER_UV=[[0,0],[0,1],[1,1],[1,0]];
// 材质包用的语义名 → 图集槽位
var TILE_NAME_INDEX = {
  grass_top:0, grass_side:1, dirt:2, stone:3, sand:4, tree_side:5, leaves:6,
  planks:7, tree_top:8, coal_ore:9, iron_ore:10, cobble:11,
  workbench:12, brick:13, glass:14
};
var PX_INSET=0.5/TILE_PX;
function cuU(cu){ return cu ? 1-PX_INSET : PX_INSET; }
function tileV(ti,cv){ var v0=1-(ti+1)/TILES, dv=1/TILES; return v0+(cv?(1-PX_INSET)*dv:PX_INSET*dv); }

function prand(seed){ var x=Math.sin(seed*127.1+311.7)*43758.5453; return x-Math.floor(x); }
// ============ 原创“圆润风”程序化材质(不复制任何现有材质包)============
// 思路:柔和噪点打底 + 大块明暗 + 圆角倒角(角部压暗、边缘内描边)
//       + 顶部高光/底部阴影 + 圆润色块,整体是原创的"软糖/粘土"质感。
function vnoise(seed,u,v,cell){
  var gx=u/cell, gy=v/cell, x0=Math.floor(gx), y0=Math.floor(gy);
  var fx=gx-x0, fy=gy-y0; fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy);
  function h(i,j){ return prand(seed+i*57.31+j*131.77); }
  var top=h(x0,y0)*(1-fx)+h(x0+1,y0)*fx;
  var bot=h(x0,y0+1)*(1-fx)+h(x0+1,y0+1)*fx;
  return top*(1-fy)+bot*fy;
}
function mixc(a,b,t){ t=t<0?0:(t>1?1:t); return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]; }
function ndist(x,y,S,cx,cy){ var dx=(x+0.5)/S-cx, dy=(y+0.5)/S-cy; return Math.sqrt(dx*dx+dy*dy); }
function roundBevel(x,y,S){
  var u=(x+0.5)/S, v=(y+0.5)/S, f=1;
  f += (0.5-v)*0.15 + (0.5-u)*0.05;            // 上亮下暗 / 左亮右暗
  var R=S*0.36, cx=Math.min(x,S-1-x), cy=Math.min(y,S-1-y);
  if(cx<R && cy<R){                            // 圆角倒角:角部按距离压暗
    var t=Math.sqrt((R-cx)*(R-cx)+(R-cy)*(R-cy))/R;
    if(t>1.0) f*=0.62; else if(t>0.90) f*=0.78; else if(t>0.78) f*=0.90;
  }
  var e=Math.min(x,S-1-x,y,S-1-y);
  if(e===0) f*=0.86; else if(e===1) f*=1.06;  // 圆润内描边
  return f;
}
function roundBase(ti,x,y,S){
  var u=(x+0.5)/S, v=(y+0.5)/S, col, k, cx, cy, t;
  var n1=vnoise(101+ti*13,u,v,0.55)-0.5;
  var n2=vnoise(211+ti*17,u,v,0.17)-0.5;
  var n3=prand(ti*977+x*131+y*613)-0.5;
  switch(ti){
    case 0: // 草顶
      col=mixc([93,172,60],[124,203,84], vnoise(7,u,v,0.42));
      for(k=0;k<8;k++){
        cx=prand(31.7+k*17.3); cy=prand(77.1+k*29.7);
        t=ndist(x,y,S,cx,cy)/0.085;
        if(t<1) col=mixc(col,[143,214,99],(1-t)*0.75);
      }
      break;
    case 1: { // 草侧:泥土 + 圆润草边
      col=mixc([126,95,61],[152,120,82], vnoise(23,u,v,0.3));
      var edge=S*(0.26+Math.sin(u*Math.PI*2.6)*0.035)+n2*S*0.35;
      if(y<edge) col=mixc([92,170,59],[125,202,85], vnoise(19,u,v,0.4));
      else if(y<edge+1.5) col=[62,110,44];
      else if(y<edge+2.8 && prand(x*7.1+ti)>0.55) col=[86,140,58];
      break;
    }
    case 2: // 泥土
      col=mixc([136,104,67],[163,130,92], vnoise(41,u,v,0.45));
      for(k=0;k<5;k++){
        cx=prand(61+k*13.7)*0.86+0.07; cy=prand(97+k*23.1)*0.86+0.07;
        t=ndist(x,y,S,cx,cy)/0.09;
        if(t<1) col=mixc(col,[112,84,52],(1-t)*0.6);
      }
      break;
    case 3: // 石头
      col=mixc([132,132,134],[158,158,161], vnoise(53,u,v,0.55));
      for(k=0;k<4;k++){
        cx=prand(83+k*11.3)*0.8+0.1; cy=prand(113+k*19.7)*0.8+0.1;
        t=ndist(x,y,S,cx,cy)/0.13;
        if(t<1) col=mixc(col,[114,114,117],(1-t)*0.55);
      }
      break;
    case 4: // 沙子
      col=mixc([223,207,143],[238,226,170], vnoise(67,u,v,0.5));
      if(prand(29+x*37+y*71)>0.90) col=mixc(col,[203,182,118],0.7);
      break;
    case 5: { // 原木侧:竖纹树皮
      col=mixc([104,72,42],[136,98,60], vnoise(71,u,v,0.22));
      var gcol=Math.abs(((u*4)%1)-0.5)*2;
      if(gcol>0.86) col=mixc(col,[74,50,28],0.65);
      else if(gcol<0.12) col=mixc(col,[160,120,76],0.45);
      break;
    }
    case 6: // 树叶
      col=mixc([47,102,38],[78,146,58], vnoise(83,u,v,0.35));
      for(k=0;k<9;k++){
        cx=prand(37+k*19.1)*0.88+0.06; cy=prand(59+k*23.7)*0.88+0.06;
        t=ndist(x,y,S,cx,cy)/0.075;
        if(t<1) col=mixc(col,[34,76,28],(1-t)*0.8);
      }
      break;
    case 7: { // 木板:横向板条 + 板缝
      var row=Math.floor(v*4), tint=0.96+prand(row*31.7+7)*0.10;
      col=mixc([176,136,78],[203,164,104], vnoise(97+row,u,v,0.14));
      if(prand(row*13.3+Math.floor(u*22)*3.7)>0.86) col=mixc(col,[152,113,62],0.7);
      var seam=Math.abs(v*4-Math.round(v*4));
      if(seam<0.035) col=[96,68,38];
      else if(seam<0.075) col=mixc(col,[126,94,56],0.6);
      col=[col[0]*tint,col[1]*tint,col[2]*tint];
      break;
    }
    case 8: { // 原木顶:年轮
      var ox=0.5+(prand(5)-0.5)*0.06, oy2=0.5+(prand(9)-0.5)*0.06;
      t=ndist(x,y,S,ox,oy2);
      var ring=Math.sin(t*Math.PI*11+prand(3)*2)*0.5+0.5;
      col=mixc([128,92,52],[176,136,84], ring*0.75+vnoise(11,u,v,0.2)*0.25);
      if(t<0.055) col=[100,70,38];
      break;
    }
    case 9: case 10: { // 矿石:石头 + 圆润矿点
      col=mixc([132,132,134],[158,158,161], vnoise(53,u,v,0.55));
      var bright=(ti===9)?[70,70,76]:[234,188,134];
      var darkc =(ti===9)?[24,24,26]:[140,96,56];
      for(k=0;k<4;k++){
        cx=0.18+prand(ti*13+k*11.7)*0.64; cy=0.18+prand(ti*29+k*17.3)*0.64;
        t=ndist(x,y,S,cx,cy)/0.115;
        if(t<1.0) col=mixc(bright,darkc,t*0.9+0.08);
        else if(t<1.25) col=mixc(col,[96,96,100],0.45);
      }
      break;
    }
    case 11: { // 圆石:几块圆润石头
      col=mixc([120,120,118],[150,150,148], vnoise(107,u,v,0.3));
      var cxs=[0.24,0.62,0.82,0.36,0.66], cys=[0.26,0.22,0.58,0.66,0.80], rrs=[0.27,0.25,0.22,0.25,0.20];
      var best=9, b=0;
      for(k=0;k<5;k++){ t=ndist(x,y,S,cxs[k],cys[k])/rrs[k]; if(t<best){ best=t; b=k; } }
      if(best<1) col=mixc([178,178,174],[126,126,124], best*1.05);
      else if(best<1.12) col=[86,86,84];
      break;
    }
    case 12: { // 工作台:木板 + 圆润外框 + 3×3 网格
      col=mixc([168,128,74],[198,158,100], vnoise(113,u,v,0.18));
      if(Math.abs(v*3-Math.round(v*3))<0.028) col=[110,78,42];
      var e2=Math.min(u,1-u,v,1-v);
      if(e2<0.075) col=mixc([110,78,42],[140,102,58], e2/0.075);
      else if(e2<0.10) col=mixc(col,[214,178,120],0.5);
      if(e2>=0.10){
        var gu=Math.min(Math.abs(u-1/3),Math.abs(u-2/3)), gv=Math.min(Math.abs(v-1/3),Math.abs(v-2/3));
        if(gu<0.022||gv<0.022) col=mixc(col,[104,72,40],0.75);
      }
      break;
    }
    case 13: { // 石砖:错缝砖块 + 圆润砖边
      var rowb=Math.min(2,Math.floor(v*3)), off=(rowb%2)?0.25:0.0;
      var bu=((u+off)*2)%1, bv=(v*3)%1;
      var de=Math.min(bu,1-bu,bv,1-bv), mortar=0.055;
      if(de<mortar) col=[214,205,190];
      else if(de<mortar*1.9) col=mixc([126,58,46],[168,78,62],(de-mortar)/mortar);
      else col=mixc([160,74,58],[186,96,76], vnoise(131,u,v,0.25));
      break;
    }
    default:
      col=[150,150,150];
  }
  var f=1+n1*0.24+n2*0.12+n3*0.05, bb=roundBevel(x,y,S);
  return [col[0]*f*bb, col[1]*f*bb, col[2]*f*bb];
}
function drawRoundAtlas(ctx){
  var S=TILE_PX, ti, x, y, c;
  for(ti=0;ti<14;ti++){
    var oy=ti*S;
    for(y=0;y<S;y++){
      for(x=0;x<S;x++){
        c=roundBase(ti,x,y,S);
        ctx.fillStyle='rgb('+(c[0]<0?0:c[0]>255?255:c[0]|0)+','+(c[1]<0?0:c[1]>255?255:c[1]|0)+','+(c[2]<0?0:c[2]>255?255:c[2]|0)+')';
        ctx.fillRect(x,oy+y,1,1);
      }
    }
  }
  drawGlassTile(ctx,14,S);
}
function drawGlassTile(ctx,ti,S){
  var oy=ti*S, Rp=Math.max(2,Math.round(S*0.22)), x, y;
  ctx.clearRect(0,oy,S,S);
  for(y=0;y<S;y++){
    for(x=0;x<S;x++){
      var cx=Math.min(x,S-1-x), cy=Math.min(y,S-1-y);
      if(cx<Rp && cy<Rp){                                  // 圆角:角外像素透明
        if(Math.sqrt((Rp-cx)*(Rp-cx)+(Rp-cy)*(Rp-cy))>Rp) continue;
      }
      var e=Math.min(cx,cy), a;
      if(e===0) a=0.58; else if(e===1) a=0.40; else if(e===2) a=0.13;
      else if(e===3) a=0.045; else a=0.015;
      // 左上角一小段斜向反光(不是整条对角线,避免"奶白")
      if(Math.abs((x-y)-S*0.10)<S*0.055 && x>S*0.14 && x<S*0.52) a=Math.max(a,0.22);
      ctx.fillStyle='rgba(226,246,252,'+a.toFixed(3)+')';
      ctx.fillRect(x,oy+y,1,1);
    }
  }
}
// 材质包覆盖时用的矿石/工作台叠加(基于包自己的石头/木板)
function drawOreSpecks(g,ti,S,col){
  var oy=ti*S, k, x, y;
  for(k=0;k<4;k++){
    var cx=0.18+prand(ti*13+k*11.7)*0.64, cy=0.18+prand(ti*29+k*17.3)*0.64;
    for(y=0;y<S;y++) for(x=0;x<S;x++){
      var d=ndist(x,y,S,cx,cy)/0.105;
      if(d<1.2){
        var f=d<1?(1-d*0.5):0.35;
        g.fillStyle='rgb('+((col[0]*f+18)|0)+','+((col[1]*f+18)|0)+','+((col[2]*f+18)|0)+')';
        g.fillRect(x,oy+y,1,1);
      }
    }
  }
}
function drawBenchOverlay(g,ti,S){
  var oy=ti*S, bw=Math.max(1,Math.round(S*0.075)), lw=Math.max(1,Math.round(S*0.032)), i;
  g.fillStyle='rgba(108,74,40,0.85)';
  g.fillRect(0,oy,S,bw); g.fillRect(0,oy+S-bw,S,bw);
  g.fillRect(0,oy,bw,S); g.fillRect(S-bw,oy,bw,S);
  g.fillStyle='rgba(96,66,36,0.75)';
  for(i=1;i<3;i++){
    g.fillRect(Math.round(S*i/3),oy,lw,S);
    g.fillRect(0,oy+Math.round(S*i/3),S,lw);
  }
}

function hex3(h){ return [parseInt(h.substr(1,2),16),parseInt(h.substr(3,2),16),parseInt(h.substr(5,2),16)]; }
function drawNoiseTile(ctx,ti,baseHex,amp,seed,opts){
  opts=opts||{}; var base=hex3(baseHex), oy=ti*TILE_PX;
  for(var y=0;y<TILE_PX;y++) for(var x=0;x<TILE_PX;x++){
    var n=(prand(seed+x*131+y*977)-0.5)*amp, r=base[0]+n, g=base[1]+n, b=base[2]+n;
    if(opts.topGrass && y<4){ var gc=hex3(opts.topGrass), m=(prand(seed+x*7+y*13)-0.5)*amp;
      r=gc[0]+m; g=gc[1]+m; b=gc[2]+m;
      if(y===3 && prand(seed+x*31)>0.55){ r=base[0]; g=base[1]; b=base[2]; } }
    if(opts.vlines && (x===3||x===9||x===14)){ r*=0.82; g*=0.82; b*=0.82; }
    if(opts.hlines && (y===4||y===9||y===14)){ r*=0.84; g*=0.84; b*=0.84; }
    if(opts.speck && prand(seed+x*57+y*91)>opts.speckTh){ var sc=hex3(opts.speck); r=sc[0]; g=sc[1]; b=sc[2]; }
    ctx.fillStyle='rgb('+(r|0)+','+(g|0)+','+(b|0)+')'; ctx.fillRect(x,oy+y,1,1);
  }
}
function makeAtlas(){
  atlasCanvas=document.createElement('canvas');
  atlasCanvas.width=TILE_PX; atlasCanvas.height=TILE_PX*TILES;
  var ctx=atlasCanvas.getContext('2d');
  if(THEME==='classic'){
  drawNoiseTile(ctx,0,'#6abe30',34,11);
  drawNoiseTile(ctx,1,'#8b6b45',30,23,{topGrass:'#6abe30'});
  drawNoiseTile(ctx,2,'#8b6b45',30,37);
  drawNoiseTile(ctx,3,'#8f8f8f',26,53);
  drawNoiseTile(ctx,4,'#e0d08a',22,71);
  drawNoiseTile(ctx,5,'#7a5230',26,89,{vlines:true});
  drawNoiseTile(ctx,6,'#3f7a2a',30,97);
  drawNoiseTile(ctx,7,'#b08a4f',24,113,{hlines:true});
  drawNoiseTile(ctx,8,'#9a7b4f',22,131);
  for(var ring=0;ring<4;ring++){
    var p=2+ring*2, c=(ring%2===0)?[122,82,48]:[154,123,79];
    ctx.fillStyle='rgb('+c[0]+','+c[1]+','+c[2]+')';
    for(var i=p;i<TILE_PX-p;i++){ ctx.fillRect(i,8*TILE_PX+p,1,1); ctx.fillRect(i,8*TILE_PX+TILE_PX-1-p,1,1); }
    for(var j=p;j<TILE_PX-p;j++){ ctx.fillRect(p,8*TILE_PX+j,1,1); ctx.fillRect(TILE_PX-1-p,8*TILE_PX+j,1,1); }
  }
  drawNoiseTile(ctx,9,'#8f8f8f',26,199,{speck:'#2b2b2b',speckTh:0.86});
  drawNoiseTile(ctx,10,'#8f8f8f',26,211,{speck:'#c08a5a',speckTh:0.86});
  drawNoiseTile(ctx,11,'#8a8a86',34,313,{hlines:false, vlines:false, speck:'#6f6f6c', speckTh:0.55});
  // 12 工作台:木板底 + 深色边框 + 3×3 网格 + 工具点缀
  drawNoiseTile(ctx,12,'#b08a4f',16,401,{});
  ctx.fillStyle='#6b4c2a';
  for(var i2=0;i2<TILE_PX;i2++){
    ctx.fillRect(0, 12*TILE_PX+i2, 1, 1); ctx.fillRect(TILE_PX-1, 12*TILE_PX+i2, 1, 1);
    ctx.fillRect(i2, 12*TILE_PX, 1, 1);   ctx.fillRect(i2, 12*TILE_PX+TILE_PX-1, 1, 1);
  }
  ctx.fillStyle='#7d5a33';
  for(var g2=4;g2<TILE_PX;g2+=4){
    ctx.fillRect(g2, 12*TILE_PX+1, 1, TILE_PX-2);
    ctx.fillRect(1, 12*TILE_PX+g2, TILE_PX-2, 1);
  }
  ctx.fillStyle='#3d2b17';
  ctx.fillRect(5, 12*TILE_PX+5, 6, 2); ctx.fillRect(8, 12*TILE_PX+7, 2, 6);
  // 13 石砖:灰底 + 错缝
  drawNoiseTile(ctx,13,'#9a9a96',20,421,{});
  ctx.fillStyle='#6e6e6a';
  ctx.fillRect(0, 13*TILE_PX+7, TILE_PX, 1); ctx.fillRect(0, 13*TILE_PX+15, TILE_PX, 1);
  ctx.fillRect(7, 13*TILE_PX+0, 1, 7);       ctx.fillRect(3, 13*TILE_PX+8, 1, 7);
  } else {
    drawRoundAtlas(ctx);
  }
  atlasTex=new THREE.CanvasTexture(atlasCanvas);
  atlasTex.magFilter=(THEME==='classic')?THREE.NearestFilter:THREE.LinearFilter;
  atlasTex.minFilter=(THEME==='classic')?THREE.NearestFilter:THREE.LinearFilter;
  atlasTex.generateMipmaps=false;
  atlasTex.wrapS=THREE.ClampToEdgeWrapping; atlasTex.wrapT=THREE.ClampToEdgeWrapping;
  buildHotbar();
  if(THEME==='classic') loadClassicTextures();
  else if(THEME==='pack') loadTexturePack();
  var tagEl=document.getElementById('themeTag');
  if(tagEl) tagEl.textContent='材质:'+THEME_NAME[THEME];
  var bT=document.getElementById('bTheme');
  if(bT) bT.textContent=THEME_NAME[THEME];
}

// 经典:Minetest 默认材质(CC BY-SA 3.0)
function loadClassicTextures(){
  var IMG = {};
  var wanted = {
    grass:'tex/default_grass.png', grass_side:'tex/default_grass_side.png',
    dirt:'tex/default_dirt.png',  sand:'tex/default_sand.png',
    tree:'tex/default_tree.png',  leaves:'tex/default_leaves.png',
    tree_top:'tex/default_tree_top.png', cobble:'tex/default_cobble.png',
    glass:'tex/default_glass.png'
  };
  var pending = Object.keys(wanted).length;
  function paint(){
    var g = atlasCanvas.getContext('2d'); g.imageSmoothingEnabled = false;
    function put(name, ti){ if (IMG[name]) g.drawImage(IMG[name], 0, ti*TILE_PX, TILE_PX, TILE_PX); }
    put('grass', 0);
    if (IMG.grass_side) {
      // 草侧 = 泥土打底 + 透明草边叠加(Minetest 原设计)
      if (IMG.dirt) g.drawImage(IMG.dirt, 0, 1*TILE_PX, TILE_PX, TILE_PX);
      g.drawImage(IMG.grass_side, 0, 1*TILE_PX, TILE_PX, TILE_PX);
    }
    put('dirt', 2); put('sand', 4); put('tree', 5); put('leaves', 6);
    put('tree_top', 8); put('cobble', 11); put('glass', 14);
    atlasTex.needsUpdate = true;
    buildHotbar();
  }
  Object.keys(wanted).forEach(function(k){
    var img = new Image();
    img.onload = function(){ IMG[k] = img; if(--pending === 0) paint(); };
    img.onerror = function(){ if(--pending === 0) paint(); };
    img.src = wanted[k];
  });
  if (pending === 0) paint();
}

// 材质包:tex/pack/manifest.json(包里缺的方块自动用原创圆润贴图补)
function loadTexturePack(){
  if (typeof fetch !== 'function') return;
  fetch('tex/pack/manifest.json').then(function(res){ return res.ok ? res.json() : null; })
    .then(function(m){
      if (!m || !m.tiles) return;
      var IMG = {}, keys = Object.keys(m.tiles), left = 0;
      keys.forEach(function(name){
        if (TILE_NAME_INDEX[name] === undefined) return;
        left++;
        var img = new Image();
        img.onload = function(){ IMG[name] = img; if(--left === 0) compositePack(IMG); };
        img.onerror = function(){ if(--left === 0) compositePack(IMG); };
        img.src = 'tex/pack/' + m.tiles[name];
      });
      if (left === 0) compositePack(IMG);
      if (m.name) toast('材质包:' + m.name);
    }).catch(function(){});
}

// 用材质包的图覆盖图集;包里没有的(矿石/工作台)用包自己的石头/木板合成
function compositePack(IMG){
  var g = atlasCanvas.getContext('2d'); g.imageSmoothingEnabled = true;
  function put(k, ti){ if (IMG[k]) g.drawImage(IMG[k], 0, ti*TILE_PX, TILE_PX, TILE_PX); }
  put('grass_top', 0); put('dirt', 2); put('stone', 3); put('sand', 4);
  put('tree_side', 5); put('leaves', 6); put('planks', 7); put('tree_top', 8);
  put('cobble', 11); put('brick', 13); put('glass', 14);
  if (IMG.dirt && IMG.grass_side) {
    g.drawImage(IMG.dirt, 0, TILE_PX, TILE_PX, TILE_PX);
    g.drawImage(IMG.grass_side, 0, TILE_PX, TILE_PX, TILE_PX);
  } else put('grass_side', 1);
  if (IMG.stone) {
    g.drawImage(IMG.stone, 0, 9*TILE_PX, TILE_PX, TILE_PX);
    drawOreSpecks(g, 9, TILE_PX, [36,36,38]);
    g.drawImage(IMG.stone, 0, 10*TILE_PX, TILE_PX, TILE_PX);
    drawOreSpecks(g, 10, TILE_PX, [198,146,96]);
  }
  if (IMG.planks) {
    g.drawImage(IMG.planks, 0, 12*TILE_PX, TILE_PX, TILE_PX);
    drawBenchOverlay(g, 12, TILE_PX);
  }
  atlasTex.needsUpdate = true;
  buildHotbar();
}

// ===================== 花草图集(独立小图集,风格与主题无关)=====================
var PLANT_PX=32, PLANT_TILES=3, plantCanvas=null, plantTex=null, matPlant=null, PLANT_INSET=0.5/32;
var PLANT_TILE={}; PLANT_TILE[B.FLOWER]=0; PLANT_TILE[B.TALLGRASS]=1; PLANT_TILE[B.TORCH]=2;
function plantV(ti,cv){ var dv=1/PLANT_TILES, v0=1-(ti+1)*dv; return v0+(cv?(1-PLANT_INSET)*dv:PLANT_INSET*dv); }
function makePlantAtlas(){
  plantCanvas=document.createElement('canvas');
  plantCanvas.width=PLANT_PX; plantCanvas.height=PLANT_PX*PLANT_TILES;
  var ctx=plantCanvas.getContext('2d');
  var S=PLANT_PX;
  function px(x,y,r,g,b){ ctx.fillStyle='rgb('+(r|0)+','+(g|0)+','+(b|0)+')'; ctx.fillRect(x,y,1,1); }
  // ---- 0 花 ----
  ctx.clearRect(0,0,S,S);
  for(var y=13;y<S-1;y++){ px(15,y,58,118,44); px(16,y,74,142,54); }
  px(12,22,76,148,56); px(13,22,88,162,62); px(11,21,70,138,52);
  px(17,18,84,156,60); px(18,18,96,172,66); px(19,17,78,146,56);
  for(var k=0;k<5;k++){
    var a=-Math.PI/2+k*Math.PI*2/5, cx2=15.5+Math.cos(a)*4.3, cy2=10+Math.sin(a)*4.3;
    for(var dy=-2;dy<=2;dy++) for(var dx=-2;dx<=2;dx++){
      if(dx*dx+dy*dy>4.6) continue;
      var X=Math.round(cx2+dx), Y=Math.round(cy2+dy);
      if(X<0||X>=S||Y<0||Y>=S) continue;
      var l=(dx+2)/4;
      px(X,Y, 226+26*l, 78+70*l, 118+46*l);
    }
  }
  px(15,10,250,222,92); px(16,10,255,238,140); px(15,11,236,204,80); px(16,11,246,220,104);
  // ---- 1 高草 ----
  var oy=S;
  ctx.clearRect(0,oy,S,S);
  var blades=[[4,12,-1],[7,8,1],[10,11,-1],[13,6,1],[16,9,-1],[20,7,1],[24,11,-1],[27,13,1]];
  for(var b=0;b<blades.length;b++){
    var bx=blades[b][0], top=blades[b][1], lean=blades[b][2];
    var cr=64+((b*37)%34), cg=126+((b*53)%48), cb=48+((b*29)%26);
    for(var yy=S-2;yy>=top;yy--){
      var t2=(S-2-yy)/Math.max(1,(S-2-top));
      var X2=Math.round(bx+lean*t2*t2*3);
      px(X2,oy+yy,cr,cg,cb);
      if(t2<0.35) px(X2+(lean>0?-1:1),oy+yy,cr-14,cg-24,cb-10);
    }
  }
  // ---- 2 火把 ----
  var oy2=S*2;
  ctx.clearRect(0,oy2,S,S);
  for(var ty=14;ty<S-2;ty++){
    px(15,oy2+ty,118,78,42); px(16,oy2+ty,146,100,58);
    if(ty%5===0){ px(15,oy2+ty,96,62,32); px(16,oy2+ty,124,84,44); }
  }
  for(var fy=4;fy<=15;fy++){
    var w=Math.round((15-fy)*0.42)+1;
    for(var fx=-w;fx<=w;fx++){
      if(Math.abs(fx)===w && fy<7) continue;
      px(15+fx, oy2+fy, 236, 118, 40);
    }
  }
  for(var fy2=7;fy2<=14;fy2++){
    var w2=Math.max(0,Math.round((14-fy2)*0.36));
    for(var fx2=-w2;fx2<=w2;fx2++) px(15+fx2, oy2+fy2, 252, 212, 84);
  }
  px(15,oy2+12,255,246,196); px(16,oy2+12,255,238,170); px(15,oy2+13,255,240,180);
  plantTex=new THREE.CanvasTexture(plantCanvas);
  plantTex.magFilter=THREE.LinearFilter; plantTex.minFilter=THREE.LinearFilter;
  plantTex.generateMipmaps=false;
  plantTex.wrapS=THREE.ClampToEdgeWrapping; plantTex.wrapT=THREE.ClampToEdgeWrapping;
}

// ===================== 渲染 =====================
var scene,camera,renderer,highlight,matOpaque,matWater,matGlass,matGlow;
var FACES=[
  {d:[ 1,0,0],v:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],shade:0.86,key:'side'},
  {d:[-1,0,0],v:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],shade:0.84,key:'side'},
  {d:[0, 1,0],v:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]],shade:1.00,key:'top'},
  {d:[0,-1,0],v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],shade:0.60,key:'bottom'},
  {d:[0,0, 1],v:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],shade:0.72,key:'side'},
  {d:[0,0,-1],v:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]],shade:0.76,key:'side'}
];
var WATER_RGB=hex3('#3a6ec0'), WATER_R=WATER_RGB[0]/255, WATER_G=WATER_RGB[1]/255, WATER_B=WATER_RGB[2]/255;

// ===================== 昼夜循环 / 天空 =====================
var worldTime=0.30, DAY_SECONDS=600, timeFrozen=false;   // 0=午夜 0.25=日出 0.5=正午 0.75=日落
var skyNight=new THREE.Color(0x0a0f24), skyDay=new THREE.Color(0x8fc9f5), skyDusk=new THREE.Color(0xe89a63);
var _sky=new THREE.Color(), _sunDir=new THREE.Vector3();
var sunMesh=null, moonMesh=null, starsPts=null;
function dayPhase(){
  if(worldTime<0.20) return '深夜';
  if(worldTime<0.30) return '清晨';
  if(worldTime<0.45) return '上午';
  if(worldTime<0.55) return '正午';
  if(worldTime<0.70) return '下午';
  if(worldTime<0.82) return '黄昏';
  return '夜晚';
}
function clockText(){
  var mins=Math.floor(worldTime*24*60)%(24*60), h=Math.floor(mins/60), m=mins%60;
  return (h<10?'0':'')+h+':'+(m<10?'0':'')+m;
}
function buildSky(){
  var sp=[], i;
  for(i=0;i<260;i++){
    var a=prand(i*3.7+1)*Math.PI*2, b=Math.acos(prand(i*7.1+2)*2-1), r=170;
    sp.push(Math.sin(b)*Math.cos(a)*r, Math.cos(b)*r*0.9+8, Math.sin(b)*Math.sin(a)*r);
  }
  var g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(sp,3));
  starsPts=new THREE.Points(g, new THREE.PointsMaterial({color:0xffffff,size:2.2,sizeAttenuation:false,
    transparent:true,opacity:0,depthWrite:false,fog:false}));
  scene.add(starsPts);
  function disc(col,size){
    var m=new THREE.Mesh(new THREE.PlaneGeometry(size,size),
      new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:1,fog:false,depthWrite:false}));
    m.renderOrder=-1; scene.add(m); return m;
  }
  sunMesh=disc(0xfff3c4,26);
  moonMesh=disc(0xdfe8ff,18);
}
function updateSky(dt){
  if(!timeFrozen) worldTime=(worldTime+dt/DAY_SECONDS)%1;
  var ang=(worldTime-0.25)*Math.PI*2, elev=Math.sin(ang);
  var day=Math.max(0,Math.min(1,(elev+0.12)/0.34));
  var dusk=Math.max(0,1-Math.abs(elev)/0.30);
  _sky.copy(skyNight).lerp(skyDay,day).lerp(skyDusk,dusk*0.45*day);
  if(scene){
    if(scene.background&&scene.background.copy) scene.background.copy(_sky);
    if(scene.fog&&scene.fog.color) scene.fog.color.copy(_sky);
  }
  var lf=0.42+0.58*day;   // 夜间保留下限亮度,避免全黑看不清
  if(matOpaque){ matOpaque.color.setScalar(lf); matWater.color.setScalar(lf); matGlass.color.setScalar(lf); }
  if(typeof MOB_MATS!=='undefined'){
    for(var mk in MOB_MATS){
      var mm=MOB_MATS[mk];
      if(mm.bodyBase) mm.body.color.setRGB(mm.bodyBase[0]*lf/255,mm.bodyBase[1]*lf/255,mm.bodyBase[2]*lf/255);
      if(mm.headBase) mm.head.color.setRGB(mm.headBase[0]*lf/255,mm.headBase[1]*lf/255,mm.headBase[2]*lf/255);
      if(mm.legBase)  mm.leg.color.setRGB(mm.legBase[0]*lf/255, mm.legBase[1]*lf/255, mm.legBase[2]*lf/255);
    }
  }
  if(starsPts){
    starsPts.material.opacity=Math.max(0,1-day)*0.95;
    starsPts.position.copy(camera.position);
    starsPts.rotation.y=worldTime*Math.PI*2;
  }
  _sunDir.set(Math.cos(ang),elev,-0.28);
  if(_sunDir.length()>0) _sunDir.normalize();
  if(sunMesh){
    sunMesh.position.copy(camera.position).addScaledVector(_sunDir,150);
    sunMesh.lookAt(camera.position);
    sunMesh.material.opacity=Math.max(0,Math.min(1,(elev+0.25)/0.2));
  }
  if(moonMesh){
    moonMesh.position.copy(camera.position).addScaledVector(_sunDir,-150);
    moonMesh.lookAt(camera.position);
    moonMesh.material.opacity=Math.max(0,1-day*1.1)*0.95;
  }
}

// ===================== 音效(纯 WebAudio 程序化合成,无任何音频素材)=====================
var AC=null, masterGain=null, noiseBuf=null, soundOn=true;
try{ var _sv=localStorage.getItem('voxel_sound'); if(_sv==='0') soundOn=false; }catch(e){}
function audioInit(){
  if(AC) return;
  try{
    var Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx) return;
    AC=new Ctx();
    masterGain=AC.createGain(); masterGain.gain.value=0.45; masterGain.connect(AC.destination);
    var len=Math.floor(AC.sampleRate*0.6);
    noiseBuf=AC.createBuffer(1,len,AC.sampleRate);
    var d=noiseBuf.getChannelData(0);
    for(var i=0;i<len;i++) d[i]=Math.random()*2-1;
  }catch(e){ AC=null; }
}
function audioResume(){ try{ if(AC&&AC.state==='suspended') AC.resume(); }catch(e){} }
function audioEnv(node,peak,attack,decay){
  var t=AC.currentTime, g=AC.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002,peak),t+attack);
  g.gain.exponentialRampToValueAtTime(0.0001,t+attack+decay);
  node.connect(g);
  try{ g.connect(masterGain); }catch(e){}
  return g;
}
function noiseHit(freq,q,peak,attack,decay,type){
  if(!AC||!soundOn) return;
  try{
    var src=AC.createBufferSource(); src.buffer=noiseBuf;
    var f=AC.createBiquadFilter(); f.type=type||'bandpass'; f.frequency.value=freq; f.Q.value=q||1;
    src.connect(f);
    audioEnv(f,peak,attack,decay);
    src.start(); src.stop(AC.currentTime+attack+decay+0.05);
  }catch(e){}
}
function tone(freq,peak,attack,decay,type){
  if(!AC||!soundOn) return;
  try{
    var o=AC.createOscillator(); o.type=type||'sine'; o.frequency.value=freq;
    audioEnv(o,peak,attack,decay);
    o.start(); o.stop(AC.currentTime+attack+decay+0.05);
  }catch(e){}
}
function sfxStep(){ noiseHit(200+Math.random()*90,1.1,0.09,0.004,0.08,'bandpass'); }
function sfxBreak(bt){
  var hard=(bt===B.STONE||bt===B.COBBLE||bt===B.BRICK||bt===B.COAL||bt===B.IRON);
  var f=hard?900:(bt===B.GLASS?2600:(bt===B.SAND?620:520));
  noiseHit(f,0.85,0.20,0.003,0.15,'bandpass');
  noiseHit(f*0.45,0.6,0.10,0.002,0.10,'lowpass');
}
function sfxPlace(bt){ noiseHit(bt===B.GLASS?1900:340,1.0,0.15,0.004,0.09); tone(140,0.05,0.004,0.07); }
function sfxCraft(){ tone(660,0.09,0.005,0.09,'triangle'); setTimeout(function(){tone(990,0.07,0.005,0.11,'triangle');},85); }
function sfxUi(){ tone(520,0.045,0.003,0.05,'square'); }
function sfxHurt(){ tone(170,0.13,0.004,0.18,'sawtooth'); noiseHit(300,0.7,0.09,0.003,0.11); }
function toggleSound(){ soundOn=!soundOn; try{ localStorage.setItem('voxel_sound',soundOn?'1':'0'); }catch(e){} if(soundOn){ audioInit(); audioResume(); sfxUi(); } return soundOn; }

function aoAt(x,y,z,n,vx,vy,vz){
  var axes=[]; if(n[0]===0)axes.push(0); if(n[1]===0)axes.push(1); if(n[2]===0)axes.push(2);
  if(axes.length<2) return 1;
  var a=axes[0],b=axes[1];
  var ca=(a===0?vx:(a===1?vy:vz)), cb=(b===0?vx:(b===1?vy:vz));
  var da=ca>0.5?1:-1, db=cb>0.5?1:-1;
  var o1=[0,0,0],o2=[0,0,0],oc=[0,0,0];
  o1[a]=da; o2[b]=db; oc[a]=da; oc[b]=db;
  var px=x+n[0],py=y+n[1],pz=z+n[2];
  var s1=SOLID[getBlock(px+o1[0],py+o1[1],pz+o1[2])]?1:0;
  var s2=SOLID[getBlock(px+o2[0],py+o2[1],pz+o2[2])]?1:0;
  var cc=SOLID[getBlock(px+oc[0],py+oc[1],pz+oc[2])]?1:0;
  return 0.60+((s1&&s2)?0:(3-(s1+s2+cc)))*0.1333;
}

function isOpaqueBlock(t){ return t!==B.AIR && !NON_OPAQUE[t]; }
function isPlant(t){ return t===B.FLOWER || t===B.TALLGRASS || t===B.TORCH; }
function isSlab(t){ return t===B.SLAB_STONE || t===B.SLAB_WOOD; }
function slabFull(t){ return t===B.SLAB_STONE?B.COBBLE:B.PLANK; }
function isTarget(x,y,z){ var t=getBlock(x,y,z); return SOLID[t]===1 || isPlant(t); }
function buildChunkMesh(cx,cz){
  var c=getChunk(cx,cz), x0=cx*CHUNK, z0=cz*CHUNK;
  var pos=[],col=[],ind=[],uv=[],wpos=[],wcol=[],wind=[],gpos=[],gcol=[],gind=[],guv=[];
  var ppos=[],pcol=[],pind=[],puv=[];
  var qpos=[],qcol=[],qind=[];
  ensureLight(c);
  for(var lx=0;lx<CHUNK;lx++) for(var lz=0;lz<CHUNK;lz++){
    var x=x0+lx, z=z0+lz;
    for(var y=0;y<HEIGHT;y++){
      var t=c.blocks[localIdx(lx,y,lz)];
      if(t===B.AIR) continue;
      if(isPlant(t)){
        var pti=PLANT_TILE[t]||0, pv0=plantV(pti,false), pv1=plantV(pti,true);
        var quads=[[[0.12,0,0.12],[0.88,0,0.88]],[[0.88,0,0.12],[0.12,0,0.88]]];
        for(var q=0;q<2;q++){
          var A=quads[q][0], Bv=quads[q][1], pb=ppos.length/3, sh3=(t===B.TORCH)?1.45:0.94;
          ppos.push(x+A[0],y+A[1],z+A[2], x+Bv[0],y+Bv[1],z+Bv[2],
                    x+Bv[0],y+Bv[1]+1,z+Bv[2], x+A[0],y+A[1]+1,z+A[2]);
          pcol.push(sh3,sh3,sh3, sh3,sh3,sh3, sh3,sh3,sh3, sh3,sh3,sh3);
          puv.push(PLANT_INSET,pv0, 1-PLANT_INSET,pv0, 1-PLANT_INSET,pv1, PLANT_INSET,pv1);
          pind.push(pb,pb+1,pb+2, pb,pb+2,pb+3);
        }
        continue;
      }
      var kind = (t===B.WATER)?2:((t===B.GLASS)?1:0);
      var m = TILE_OF[t] || {top:3,side:3,bottom:3};
      for(var f=0;f<6;f++){
        var F=FACES[f], nb=getBlock(x+F.d[0],y+F.d[1],z+F.d[2]);
        if(kind===2){ if(nb!==B.AIR) continue; }
        else if(kind===1){ if(isOpaqueBlock(nb) || nb===B.GLASS) continue; }
        else { if(isOpaqueBlock(nb)) continue; }
        var lit=0;
        if(kind===0){
          var lv=lightAt(x+F.d[0], y+F.d[1], z+F.d[2]);
          if(lv>0) lit=lv/LIGHT_MAX;
        }
        var P=pos,C=col,I=ind,U=uv;
        if(kind===2){ P=wpos; C=wcol; I=wind; U=null; }
        else if(kind===1){ P=gpos; C=gcol; I=gind; U=guv; }
        var base=P.length/3, shade=F.shade;
        var tile = kind===0 ? (F.key==='top'?m.top:(F.key==='bottom'?m.bottom:m.side)) : 0;
        var slabHere=isSlab(t) && kind===0;
        for(var vi=0;vi<4;vi++){
          var vv=F.v[vi];
          var vy=slabHere?(vv[1]*0.5):vv[1];
          P.push(x+vv[0],y+vy,z+vv[2]);
          if(kind===2){ C.push(WATER_R*shade,WATER_G*shade,WATER_B*shade); }
          else{
            var sh = (kind===1) ? shade*0.95 : shade*aoAt(x,y,z,F.d,vv[0],vv[1],vv[2]);
            if(lit>0.02){ var b1=sh*(1+lit*0.55); C.push(b1*(1+lit*0.14), b1*(1+lit*0.07), b1); }
            else C.push(sh,sh,sh);
            var uu,vv2;
            if(F.d[1]!==0){ uu=vv[0]; vv2=vv[2]; }
            else if(F.d[0]!==0){ uu=vv[2]; vv2=vy; }
            else { uu=vv[0]; vv2=vy; }
            U.push(cuU(uu), tileV(tile,vv2));
          }
        }
        I.push(base,base+1,base+2,base,base+2,base+3);
        if(lit>0.03){
          var qb=qpos.length/3, off=0.012;
          for(var vq=0;vq<4;vq++){
            var vv3=F.v[vq];
            qpos.push(x+vv3[0]+F.d[0]*off, y+vv3[1]+F.d[1]*off, z+vv3[2]+F.d[2]*off);
            qcol.push(lit*0.55, lit*0.37, lit*0.16);
          }
          qind.push(qb,qb+1,qb+2, qb,qb+2,qb+3);
        }
      }
    }
  }
  if(c.mesh){ scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh=null; }
  if(c.water){ scene.remove(c.water); c.water.geometry.dispose(); c.water=null; }
  if(c.glassMesh){ scene.remove(c.glassMesh); c.glassMesh.geometry.dispose(); c.glassMesh=null; }
  if(c.plant){ scene.remove(c.plant); c.plant.geometry.dispose(); c.plant=null; }
  if(c.glow){ scene.remove(c.glow); c.glow.geometry.dispose(); c.glow=null; }
  function mk(pp,cc,ii,uu,mat){
    var g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pp,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(cc,3));
    if(uu) g.setAttribute('uv',new THREE.Float32BufferAttribute(uu,2));
    g.setIndex(ii);
    var mesh=new THREE.Mesh(g,mat); scene.add(mesh); return mesh;
  }
  if(pos.length) c.mesh=mk(pos,col,ind,uv,matOpaque);
  if(wpos.length){ c.water=mk(wpos,wcol,wind,null,matWater); c.water.renderOrder=1; }
  if(gpos.length) c.glassMesh=mk(gpos,gcol,gind,guv,matGlass);
  if(ppos.length) c.plant=mk(ppos,pcol,pind,puv,matPlant);
  if(qpos.length) c.glow=mk(qpos,qcol,qind,null,matGlow);
  c.built=true;
}
function queueMesh(cx,cz){
  var k=ckey(cx,cz);
  if(meshQueued.has(k)) return;
  meshQueued.add(k); meshQueue.push([cx,cz]);
}
function nowMs(){ return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now(); }
function flushMeshBudget(ms){
  var t0=nowMs();
  while(meshQueue.length && (nowMs()-t0)<ms){
    var p=meshQueue.shift(); meshQueued.delete(ckey(p[0],p[1]));
    buildChunkMesh(p[0],p[1]);
  }
}
function flushMeshQueue(max){
  var n=0;
  while(meshQueue.length && n<max){
    var p=meshQueue.shift(); meshQueued.delete(ckey(p[0],p[1]));
    buildChunkMesh(p[0],p[1]); n++;
  }
}
function disposeChunk(c){
  if(c.mesh){ scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh=null; }
  if(c.water){ scene.remove(c.water); c.water.geometry.dispose(); c.water=null; }
  if(c.glassMesh){ scene.remove(c.glassMesh); c.glassMesh.geometry.dispose(); c.glassMesh=null; }
  if(c.plant){ scene.remove(c.plant); c.plant.geometry.dispose(); c.plant=null; }
  if(c.glow){ scene.remove(c.glow); c.glow.geometry.dispose(); c.glow=null; }
}

// ===================== 流式加载 =====================
var lastPCX=1e9, lastPCZ=1e9;
function streamChunks(force){
  var pcx=Math.floor(player.pos.x/CHUNK), pcz=Math.floor(player.pos.z/CHUNK);
  if(!force && pcx===lastPCX && pcz===lastPCZ) return;
  lastPCX=pcx; lastPCZ=pcz;
  for(var dx=-RENDER_R;dx<=RENDER_R;dx++) for(var dz=-RENDER_R;dz<=RENDER_R;dz++){
    var c=getChunk(pcx+dx, pcz+dz);
    if(!c.built) queueMesh(pcx+dx, pcz+dz);
  }
  // 玩家当前所在区块必须立刻有网格(保证"脚下永远有地面")
  var pc = getChunk(pcx, pcz);
  if(!pc.built) buildChunkMesh(pcx, pcz);
  // 移动方向上的下一块也优先建
  var aheadX = pcx + (Math.abs(player.vel.x) > 0.5 ? Math.sign(player.vel.x) : 0);
  var aheadZ = pcz + (Math.abs(player.vel.z) > 0.5 ? Math.sign(player.vel.z) : 0);
  var pa = getChunk(aheadX, aheadZ);
  if(!pa.built) buildChunkMesh(aheadX, aheadZ);
  chunkCache.forEach(function(c,k){
    if(Math.abs(c.cx-pcx)>LOAD_R || Math.abs(c.cz-pcz)>LOAD_R){
      disposeChunk(c); chunkCache.delete(k);
    }
  });
}

// ===================== 玩家 =====================
var player={pos:new THREE.Vector3(8.5,20,8.5),vel:new THREE.Vector3(),yaw:0,pitch:0,onGround:false,fly:false};
var EYE=1.62,HALF=0.30,PH=1.80,GRAVITY=28,JUMP_V=8.8,SPEED=4.8,FLY_SPEED=9;
var stepT=0;
function collidesBox(px,py,pz,half,height){
  var minX=Math.floor(px-half),maxX=Math.floor(px+half);
  var minY=Math.floor(py),maxY=Math.floor(py+height-0.001);
  var minZ=Math.floor(pz-half),maxZ=Math.floor(pz+half);
  for(var x=minX;x<=maxX;x++) for(var y=minY;y<=maxY;y++) for(var z=minZ;z<=maxZ;z++){
    if(y<0) return true;
    if(y>=HEIGHT) continue;
    var bt=getBlock(x,y,z);
    if(SOLID[bt]===1){
      if(isSlab(bt) && py>=y+0.5) continue;   // 站在半砖顶端时不算撞
      return true;
    }
  }
  return false;
}
function collides(px,py,pz){ return collidesBox(px,py,pz,HALF,PH); }
function moveAxis(axis,d){
  if(d===0) return;
  var p=player.pos,nx=p.x,ny=p.y,nz=p.z;
  if(axis===0) nx+=d; else if(axis===1) ny+=d; else nz+=d;
  if(!collides(nx,ny,nz)){ p.x=nx; p.y=ny; p.z=nz; return; }
  if(axis===1){ player.onGround=d<0; player.vel.y=0; }
  else player.vel[axis===0?'x':'z']=0;
}
function updatePlayer(dt){
  var p=player.pos,v=player.vel;
  var fwd=0,side=0;
  if(keys['KeyW'])fwd+=1; if(keys['KeyS'])fwd-=1;
  if(keys['KeyA'])side-=1; if(keys['KeyD'])side+=1;
  fwd+=touchMove.y; side+=touchMove.x;
  var len=Math.hypot(fwd,side); if(len>1){fwd/=len;side/=len;}
  var sinY=Math.sin(player.yaw),cosY=Math.cos(player.yaw);
  var sprinting=!player.fly && (keys['ControlLeft']||keys['ControlRight']);
  var bodyWater=getBlock(Math.floor(p.x),Math.floor(p.y+0.9),Math.floor(p.z))===B.WATER;
  var sp=(player.fly?FLY_SPEED:SPEED)*(sprinting?1.55:1)*(bodyWater?0.55:1);
  v.x=(-sinY*fwd+cosY*side)*sp; v.z=(-cosY*fwd-sinY*side)*sp;
  if(player.fly){ v.y=0;
    if(keys['Space']||touchUp) v.y=FLY_SPEED;
    if(keys['ShiftLeft']||touchDown) v.y=-FLY_SPEED;
  } else if(bodyWater){
    // 游泳:轻微下沉,空格上浮,入水不摔伤
    v.y-=GRAVITY*0.18*dt; if(v.y<-3.2)v.y=-3.2;
    if(keys['Space']||touchUp) v.y=3.4;
    player.onGround=false; fallTop=null;
  } else {
    v.y-=GRAVITY*dt; if(v.y<-55)v.y=-55;
    if((keys['Space']||touchUp)&&player.onGround){ v.y=JUMP_V; player.onGround=false; }
    player.onGround=false;
  }
  moveAxis(0,v.x*dt); moveAxis(2,v.z*dt); moveAxis(1,v.y*dt);
  // 溺水(头在水里)
  var head=getBlock(Math.floor(p.x), Math.floor(p.y+EYE), Math.floor(p.z));
  var inWater=head===B.WATER;
  if(inWater){
    airSec+=dt;
    if(airSec>8){ hurtAcc+=dt; if(hurtAcc>1.5){ hurtAcc=0; hurt(2,'溺水'); } }
  } else { airSec=Math.max(0,airSec-dt*2.5); hurtAcc=0; }
  updateAirBar();
  // 摔落伤害
  if(player.fly || inWater){ fallTop=null; }
  else if(!player.onGround){
    if(fallTop===null || p.y>fallTop) fallTop=p.y;
  } else if(fallTop!==null){
    var drop=fallTop-p.y, dmg=fallDamage(drop);
    fallTop=null;
    if(dmg>0) hurt(dmg,'摔落 '+Math.round(drop)+' 格');
  }
  // 脚步声
  var moving=(Math.abs(v.x)+Math.abs(v.z))>0.7 && player.onGround && !player.fly;
  if(moving){ stepT-=dt; if(stepT<=0){ stepT=0.44; sfxStep(); } } else stepT=0;
  if(p.y<-10){ p.set(spawnPt.x,20,spawnPt.z); v.set(0,0,0); health=maxHealth; heartsUi(); }
  camera.position.set(p.x,p.y+EYE,p.z);
  camera.rotation.set(player.pitch,player.yaw,0,'YXZ');
}

// ===================== 小地图 =====================
var MAP_PX=112, MAP_STEP=2, mapCv=null, mapCtx=null, mapDraws=0, minimapOn=true, mapAcc=1;
try{ if(localStorage.getItem('voxel_minimap')==='0') minimapOn=false; }catch(e){}
var MAP_COL={};
MAP_COL[B.GRASS]=[106,190,48]; MAP_COL[B.DIRT]=[139,107,69]; MAP_COL[B.STONE]=[143,143,143];
MAP_COL[B.SAND]=[224,208,138]; MAP_COL[B.WATER]=[58,110,192]; MAP_COL[B.WOOD]=[122,82,48];
MAP_COL[B.LEAVES]=[63,122,42]; MAP_COL[B.PLANK]=[176,138,79]; MAP_COL[B.COAL]=[70,70,72];
MAP_COL[B.IRON]=[192,138,90]; MAP_COL[B.COBBLE]=[138,138,134]; MAP_COL[B.CRAFT]=[150,110,64];
MAP_COL[B.BRICK]=[154,154,150]; MAP_COL[B.GLASS]=[207,239,255];
function initMinimap(){
  mapCv=document.getElementById('minimap');
  if(!mapCv) return;
  mapCtx=mapCv.getContext('2d');
  mapCv.style.display=minimapOn?'block':'none';
}
function drawMinimap(){
  if(!mapCtx||!minimapOn) return;
  var p=player.pos, cx=Math.floor(p.x), cz=Math.floor(p.z), half=MAP_PX/2;
  mapCtx.clearRect(0,0,MAP_PX,MAP_PX);
  for(var py=0;py<MAP_PX;py+=2){
    for(var px=0;px<MAP_PX;px+=2){
      var t=topAt(cx+(px-half)*MAP_STEP, cz+(py-half)*MAP_STEP);
      if(t.h<0||!t.b) continue;
      var c=MAP_COL[t.b]||[120,120,120];
      var sh=0.60+Math.max(0,Math.min(0.48,(t.h-6)/26));
      mapCtx.fillStyle='rgb('+Math.round(c[0]*sh)+','+Math.round(c[1]*sh)+','+Math.round(c[2]*sh)+')';
      mapCtx.fillRect(px,py,2,2);
    }
  }
  mapCtx.save();
  mapCtx.translate(half,half);
  mapCtx.rotate(-player.yaw);
  mapCtx.fillStyle='#fff'; mapCtx.strokeStyle='#000'; mapCtx.lineWidth=1;
  mapCtx.beginPath();
  mapCtx.moveTo(0,-5.5); mapCtx.lineTo(3.6,4.2); mapCtx.lineTo(0,2.2); mapCtx.lineTo(-3.6,4.2);
  mapCtx.closePath(); mapCtx.fill(); mapCtx.stroke();
  mapCtx.restore();
  mapDraws++;
}
function setMinimap(on){
  minimapOn=!!on;
  try{ localStorage.setItem('voxel_minimap',minimapOn?'1':'0'); }catch(e){}
  if(mapCv) mapCv.style.display=minimapOn?'block':'none';
  if(minimapOn) { mapAcc=1; }
  return minimapOn;
}

// ===================== 生命 / 伤害 =====================
var health=20, maxHealth=20, airSec=0, hurtAcc=0, lastHurtAt=-999, regenAcc=0;
var fallTop=null, deathShown=false, spawnPt={x:8.5,y:20,z:8.5};
function nowSec(){ return (typeof performance!=='undefined'&&performance.now?performance.now():Date.now())/1000; }
function fallDamage(drop){ return drop>3.6 ? Math.min(18, Math.floor(drop-3.4)) : 0; }
function heartsUi(){
  var box=document.getElementById('hearts'); if(!box) return;
  var html='';
  for(var i=0;i<10;i++){
    var v=Math.max(0,Math.min(2,health-i*2));
    html+='<span class="hpb">♥<span class="hpf" style="width:'+(v*50)+'%">♥</span></span>';
  }
  box.innerHTML=html;
}
function updateAirBar(){
  var air=document.getElementById('airbar'); if(!air) return;
  var show=airSec>0.05;
  air.style.display=show?'block':'none';
  if(show&&air.firstChild) air.firstChild.style.width=Math.max(0,Math.min(100,(1-airSec/8)*100))+'%';
}
function hurt(n, reason){
  if(n<=0||health<=0) return;
  health=Math.max(0,health-n); lastHurtAt=nowSec(); regenAcc=0;
  sfxHurt(); heartsUi();
  document.body.style.boxShadow='inset 0 0 90px rgba(200,0,0,.55)';
  setTimeout(function(){ document.body.style.boxShadow=''; },200);
  if(health<=0) die(reason);
}
function die(reason){
  if(deathShown) return;
  deathShown=true;
  var el=document.getElementById('death'); if(el) el.style.display='flex';
  toast('你死了'+(reason?' · '+reason:''));
  setTimeout(respawn, 1000);
}
function respawn(){
  deathShown=false;
  var el=document.getElementById('death'); if(el) el.style.display='none';
  var s=spawnPt;
  var h=topAt(Math.floor(s.x),Math.floor(s.z)).h;
  player.pos.set(s.x, Math.max(h+1.2, WATER_LEVEL+1.5), s.z);
  player.vel.set(0,0,0); fallTop=null; health=maxHealth; airSec=0; hurtAcc=0;
  heartsUi(); updateAirBar();
  toast('已重生');
}

// ===================== 被动生物(羊/猪)=====================
var MOB_MAX=8, mobs=[], MOB_MATS={};
var MOB_TYPES={
  sheep:{name:'羊', body:0xf0f0f0, head:0xdcdcdc, leg:0xbcbcbc, w:0.86, h:0.82, len:1.18, hgt:0.92, speed:1.05},
  pig:  {name:'猪', body:0xe4918f, head:0xd67f7d, leg:0xbf6a68, w:0.78, h:0.74, len:1.02, hgt:0.84, speed:1.35}
};
function mobMats(type){
  if(MOB_MATS[type]) return MOB_MATS[type];
  var t=MOB_TYPES[type];
  var m={
    body:new THREE.MeshBasicMaterial({color:t.body}),
    head:new THREE.MeshBasicMaterial({color:t.head}),
    leg: new THREE.MeshBasicMaterial({color:t.leg}),
    bodyBase:hex3('#'+('000000'+t.body.toString(16)).slice(-6)),
    headBase:hex3('#'+('000000'+t.head.toString(16)).slice(-6)),
    legBase: hex3('#'+('000000'+t.leg.toString(16)).slice(-6))
  };
  MOB_MATS[type]=m; return m;
}
function buildMobMesh(type){
  var t=MOB_TYPES[type], mm=mobMats(type);
  var root=new THREE.Mesh(new THREE.BoxGeometry(t.w,t.h,t.len), mm.body);
  var head=new THREE.Mesh(new THREE.BoxGeometry(t.w*0.72,t.h*0.72,t.w*0.72), mm.head);
  head.position.set(0,t.h*0.2,t.len*0.5+t.w*0.3);
  root.add(head);
  for(var i=0;i<4;i++){
    var lg=new THREE.Mesh(new THREE.BoxGeometry(t.w*0.22,t.h*0.6,t.w*0.22), mm.leg);
    lg.position.set((i%2?1:-1)*t.w*0.3, -t.h*0.66, (i<2?1:-1)*t.len*0.28);
    root.add(lg);
  }
  return root;
}
function findMobSpot(cx,cz,rMin,rMax){
  for(var i=0;i<26;i++){
    var a=Math.random()*Math.PI*2, r=rMin+Math.random()*(rMax-rMin);
    var x=Math.floor(cx+Math.cos(a)*r), z=Math.floor(cz+Math.sin(a)*r);
    var top=topAt(x,z);
    if(top.h<WATER_LEVEL) continue;
    var b=getBlock(x,top.h,z);
    if(b===B.WATER) continue;
    if(top.b!==B.GRASS && top.b!==B.DIRT && top.b!==B.SAND && top.b!==B.LEAVES) continue;
    return {x:x+0.5, y:top.h+1, z:z+0.5};
  }
  return null;
}
function initMobs(){
  for(var i=0;i<mobs.length;i++) if(mobs[i].mesh) scene.remove(mobs[i].mesh);
  mobs=[];
  for(var k=0;k<MOB_MAX;k++){
    var type=(k%2===0)?'sheep':'pig';
    var sp=findMobSpot(spawnPt.x, spawnPt.z, 7, 26);
    if(!sp) continue;
    var mesh=buildMobMesh(type);
    scene.add(mesh);
    mobs.push({type:type,x:sp.x,y:sp.y,z:sp.z,yaw:Math.random()*6.283,vy:0,
               walk:false,timer:Math.random()*2.5,mesh:mesh});
  }
}
function mobBlocked(x,y,z,t){
  if(collidesBox(x,y,z,t.w*0.34,t.hgt)) return true;
  if(getBlock(Math.floor(x),Math.floor(y-0.3),Math.floor(z))===B.AIR) return true;   // 悬崖
  if(getBlock(Math.floor(x),Math.floor(y+0.1),Math.floor(z))===B.WATER) return true; // 不下水
  return false;
}
function respawnMob(m){
  var sp=findMobSpot(player.pos.x, player.pos.z, 16, 40);
  if(!sp) return;
  m.x=sp.x; m.y=sp.y; m.z=sp.z; m.vy=0; m.walk=false; m.timer=0.5;
}
function updateMobs(dt){
  var p=player.pos;
  for(var i=0;i<mobs.length;i++){
    var m=mobs[i], t=MOB_TYPES[m.type];
    var dx=m.x-p.x, dz=m.z-p.z, dist=Math.hypot(dx,dz);
    if(dist<3.4 && dist>0.01){ m.yaw=Math.atan2(dx,dz); m.walk=true; m.timer=Math.max(m.timer,0.7); }
    m.timer-=dt;
    if(m.timer<=0){
      m.timer=1.6+Math.random()*3.4;
      m.yaw=Math.random()*Math.PI*2;
      m.walk=Math.random()<0.72;
    }
    if(m.walk){
      var nx=m.x+Math.sin(m.yaw)*t.speed*dt, nz=m.z+Math.cos(m.yaw)*t.speed*dt;
      if(!mobBlocked(nx,m.y,nz,t)){ m.x=nx; m.z=nz; }
      else { m.yaw+=Math.PI*0.75; m.timer=0.35; }
    }
    m.vy-=GRAVITY*dt; if(m.vy<-40) m.vy=-40;
    var ny=m.y+m.vy*dt;
    if(collidesBox(m.x,ny,m.z,t.w*0.34,t.hgt)){ m.vy=0; if(m.y-ny>0.001){} }
    else m.y=ny;
    if(m.y<-5 || Math.hypot(m.x-p.x,m.z-p.z)>96) respawnMob(m);
    if(m.mesh){
      m.mesh.position.set(m.x, m.y+t.h*0.62+0.02, m.z);
      m.mesh.rotation.y=m.yaw;
    }
  }
}

// ===================== 射线 =====================
function solidAt(x,y,z){ return SOLID[getBlock(x,y,z)]; }
function raycast(maxDist){
  var cp=Math.cos(player.pitch),sp=Math.sin(player.pitch);
  var dx=-Math.sin(player.yaw)*cp,dy=sp,dz=-Math.cos(player.yaw)*cp;
  var ox=camera.position.x,oy=camera.position.y,oz=camera.position.z;
  var x=Math.floor(ox),y=Math.floor(oy),z=Math.floor(oz);
  var sx=dx>0?1:-1,sy=dy>0?1:-1,sz=dz>0?1:-1;
  var tdx=Math.abs(1/dx),tdy=Math.abs(1/dy),tdz=Math.abs(1/dz);
  var tx=(dx>0?(x+1-ox):(ox-x))*tdx, ty=(dy>0?(y+1-oy):(oy-y))*tdy, tz=(dz>0?(z+1-oz):(oz-z))*tdz;
  if(!isFinite(tdx))tx=1e9; if(!isFinite(tdy))ty=1e9; if(!isFinite(tdz))tz=1e9;
  var t=0,normal=[0,1,0];
  for(var i=0;i<160;i++){
    if(isTarget(x,y,z)) return {x:x,y:y,z:z,n:normal};
    if(tx<ty&&tx<tz){x+=sx;t=tx;tx+=tdx;normal=[-sx,0,0];}
    else if(ty<tz){y+=sy;t=ty;ty+=tdy;normal=[0,-sy,0];}
    else{z+=sz;t=tz;tz+=tdz;normal=[0,0,-sz];}
    if(t>maxDist) break;
  }
  return null;
}
function updateHighlight(){
  var hit=raycast(6);
  if(!hit){ highlight.visible=false; return; }
  highlight.visible=true;
  highlight.position.set(hit.x+0.5,hit.y+0.5,hit.z+0.5);
}
function doBreak(){
  var hit=raycast(6); if(!hit||hit.y<=0) return;
  var t=getBlock(hit.x,hit.y,hit.z);
  setBlock(hit.x,hit.y,hit.z,B.AIR);
  sfxBreak(t);
  if(t!==B.WATER) invAdd(t,1);
}
function doPlace(){
  var hit=raycast(6); if(!hit) return;
  var bt=hotSlots[selected];
  // 同种半砖 → 直接叠成完整方块
  if(isSlab(bt) && getBlock(hit.x,hit.y,hit.z)===bt){
    if(invCount(bt)<=0){ toast('没有 '+NAMES[bt]+' 了'); return; }
    setBlock(hit.x,hit.y,hit.z, slabFull(bt)); invTake(bt,1); sfxPlace(bt); return;
  }
  if(invCount(bt)<=0){ toast('没有 '+NAMES[bt]+' 了'); return; }
  var x=hit.x+hit.n[0],y=hit.y+hit.n[1],z=hit.z+hit.n[2];
  if(y<0||y>=HEIGHT) return;
  var cur=getBlock(x,y,z);
  if(cur!==B.AIR && cur!==B.WATER) return;
  var p=player.pos;
  if(!(x+1<=p.x-HALF||x>=p.x+HALF||z+1<=p.z-HALF||z>=p.z+HALF||y+1<=p.y||y>=p.y+PH)) return;
  setBlock(x,y,z,bt); invTake(bt,1); sfxPlace(bt);
}
// 短点:对准工作台就打开合成,否则放置方块
function doTapAction(){
  var hit=raycast(6);
  if(hit && getBlock(hit.x,hit.y,hit.z)===B.CRAFT){ openCraft(); return; }
  doPlace();
}
// 背包面板
function openBag(){
  var p=document.getElementById('bag'); if(!p) return;
  sfxUi();
  p.innerHTML='';
  var t1=document.createElement('div'); t1.className='ctitle';
  t1.textContent='简易合成(不用工作台)'; p.appendChild(t1);
  RECIPES.forEach(function(r){
    if(!r.basic) return;
    var can=true;
    Object.keys(r.in).forEach(function(k){ if(invCount(+k)<r.in[k]) can=false; });
    var inTxt=Object.keys(r.in).map(function(k){ return NAMES[+k]+'×'+r.in[k]; }).join(' + ');
    var outTxt=Object.keys(r.out).map(function(k){ return NAMES[+k]+'×'+r.out[k]; }).join(' + ');
    var b=document.createElement('div');
    b.className='bigbtn' + (can?'':' off');
    b.textContent = inTxt + '  →  ' + outTxt + (can?'':'（材料不足）');
    function go(e){ if(e){e.preventDefault();e.stopPropagation();}
      var ok=true;
      Object.keys(r.in).forEach(function(k){ if(invCount(+k)<r.in[k]) ok=false; });
      if(!ok){ toast('材料不足:'+inTxt+'（现有不足）'); return; }
      Object.keys(r.in).forEach(function(k){ invTake(+k, r.in[k]); });
      var outName='';
      Object.keys(r.out).forEach(function(k){ invAdd(+k, r.out[k]); outName=NAMES[+k]+' ×'+r.out[k]; });
      toast('合成成功:'+outName);
      sfxCraft();
      openBag();
    }
    b.addEventListener('pointerdown', go);
    b.addEventListener('click', go);
    p.appendChild(b);
  });
  var held=document.createElement('div'); held.className='ctitle';
  held.style.fontSize='11px'; held.style.opacity='.8';
  var parts=[];
  PLACEABLE.forEach(function(t){ var n=invCount(t); if(n>0) parts.push(NAMES[t]+'×'+n); });
  held.textContent='当前持有:'+(parts.length?parts.join('  '):'（空）');
  p.appendChild(held);
  var sup=document.createElement('div'); sup.className='cclose';
  sup.style.background='rgba(110,190,48,.35)';
  sup.textContent='补给:木板×8 + 圆石×8';
  function doSup(e){ if(e){e.preventDefault();e.stopPropagation();}
    invAdd(8,8); invAdd(11,8); toast('已补给'); openBag(); }
  sup.addEventListener('click', doSup);
  sup.addEventListener('touchstart', doSup, {passive:false});
  p.appendChild(sup);
  var t2=document.createElement('div'); t2.className='ctitle';
  t2.textContent='物品栏 · 点物品放入当前格子'; p.appendChild(t2);
  var grid=document.createElement('div'); grid.className='bag-grid';
  PLACEABLE.forEach(function(t){
    var d=document.createElement('div'); d.className='bag-item'; d.title=NAMES[t]||'';
    d.appendChild(iconFor(t));
    var c=document.createElement('span'); c.className='cnt'; c.textContent=invCount(t)||''; d.appendChild(c);
    function pick(e){ if(e){e.preventDefault();e.stopPropagation();}
      hotSlots[selected]=t; buildHotbar(); closeBag(); toast('已放入:'+NAMES[t]); }
    d.addEventListener('pointerdown', pick);
    d.addEventListener('click', pick);
    grid.appendChild(d);
  });
  p.appendChild(grid);
  var cls=document.createElement('div'); cls.className='cclose'; cls.textContent='关闭';
  cls.addEventListener('click', function(){ closeBag(); });
  cls.addEventListener('touchstart', function(e){e.preventDefault();e.stopPropagation();closeBag();},{passive:false});
  p.appendChild(cls);
  p.style.display='block';
}
function closeBag(){ var p=document.getElementById('bag'); if(p){ p.style.display='none'; p.innerHTML=''; } }
// 对准工作台按"用"
function tryUse(){
  var hit=raycast(6);
  if(hit && getBlock(hit.x,hit.y,hit.z)===B.CRAFT){ openCraft(); return; }
  toast('对准工作台再按"用"');
}

// ===================== 存档 =====================
function saveGame(quiet){
  try{
    var obj={v:4,px:player.pos.x,py:player.pos.y,pz:player.pos.z,
             yaw:player.yaw,pitch:player.pitch,sel:selected,fly:player.fly,inv:inv,
             hp:health,t:worldTime,sx:spawnPt.x,sy:spawnPt.y,sz:spawnPt.z,ch:{}};
    edits.forEach(function(m,k){ var a=[]; m.forEach(function(v,lk){ a.push(lk,v); }); obj.ch[k]=a; });
    localStorage.setItem(SAVE_KEY, JSON.stringify(obj));
    if(!quiet) toast('已保存('+(JSON.stringify(obj).length/1024).toFixed(1)+' KB)');
    return true;
  }catch(e){ if(!quiet) toast('保存失败:'+e.message); return false; }
}
function loadGame(){
  try{
    var raw=localStorage.getItem(SAVE_KEY); if(!raw) return false;
    var o=JSON.parse(raw); if(o.v!==3 && o.v!==4) return false;
    edits=new Map();
    Object.keys(o.ch||{}).forEach(function(k){
      var m=new Map(); var a=o.ch[k];
      for(var i=0;i<a.length;i+=2) m.set(a[i],a[i+1]);
      edits.set(k,m);
    });
    player.pos.set(o.px,o.py,o.pz);
    player.yaw=o.yaw||0; player.pitch=o.pitch||0;
    selected=o.sel||0; player.fly=!!o.fly;
    inv=o.inv||{};
    if(Object.keys(inv).length===0){ inv={ 8:8, 11:8 }; }   // 旧存档或空背包:发启动物资
    if(o.v>=4){
      health=typeof o.hp==='number'?o.hp:maxHealth;
      if(typeof o.t==='number') worldTime=o.t;
      if(typeof o.sx==='number') spawnPt={x:o.sx,y:o.sy||20,z:o.sz||8.5};
    }
    heartsUi();
    updateHotbar();
    // 丢弃已生成区块,确保读档后按新 edits 重新生成
    try{ chunkCache.forEach(disposeChunk); }catch(e){}
    chunkCache.clear(); meshQueue.length=0; meshQueued.clear(); lastPCX=1e9;
    return true;
  }catch(e){ return false; }
}

// ===================== 方块选择栏 =====================
function iconFor(bt){
  if(isPlant(bt)){
    var pc=document.createElement('canvas'); pc.width=32; pc.height=32;
    var pg=pc.getContext('2d'); pg.imageSmoothingEnabled=false;
    var pti=PLANT_TILE[bt]||0;
    if(plantCanvas) pg.drawImage(plantCanvas,0,pti*PLANT_PX,PLANT_PX,PLANT_PX,0,0,32,32);
    var pd=document.createElement('div'); pd.className='icon';
    pd.style.backgroundImage='url('+pc.toDataURL()+')';
    return pd;
  }
  var m=TILE_OF[bt], ti=(m&&m.top!==undefined)?m.top:3;
  var out=32;
  var c=document.createElement('canvas'); c.width=out; c.height=out;
  var g=c.getContext('2d'); g.imageSmoothingEnabled=false;
  if(atlasCanvas) g.drawImage(atlasCanvas,0,ti*TILE_PX,TILE_PX,TILE_PX,0,0,out,out);
  var d=document.createElement('div');
  d.className='icon';
  d.style.backgroundImage='url('+c.toDataURL()+')';
  return d;
}
function buildHotbar(){
  var bar=document.getElementById('hotbar'); if(!bar) return;
  bar.innerHTML='';
  hotSlots.forEach(function(bt,i){
    var d=document.createElement('div');
    d.className='slot'+(i===selected?' sel':'');
    d.appendChild(iconFor(bt));
    var c=document.createElement('span'); c.className='cnt'; d.appendChild(c);
    d.title=NAMES[bt]||'';
    d.addEventListener('touchstart',function(e){e.preventDefault();e.stopPropagation();selectSlot(i);},{passive:false});
    d.addEventListener('click',function(e){e.stopPropagation();selectSlot(i);});
    bar.appendChild(d);
  });
  updateHotbar();
}
function updateHotbar(){
  var slots=document.querySelectorAll('#hotbar .slot');
  for(var i=0;i<slots.length;i++){
    var bt=hotSlots[i], n=invCount(bt), c=slots[i].querySelector('.cnt');
    if(c) c.textContent = n>0 ? (n>999?'999+':n) : '';
    slots[i].className='slot'+(i===selected?' sel':'')+(n<=0?' empty':'');
  }
}
// ---------- 合成面板 ----------
function makeRecipeRow(r, afterCraft){
  var row=document.createElement('div'); row.className='recipe';
  var can=true;
  Object.keys(r.in).forEach(function(k){ if(invCount(+k)<r.in[k]) can=false; });
  if(!can) row.className+=' dim';
  var left=document.createElement('div'); left.className='rin';
  Object.keys(r.in).forEach(function(k){
    var t=+k, ic=iconFor(t); ic.style.width='22px'; ic.style.height='22px'; left.appendChild(ic);
    var x=document.createElement('span'); x.textContent='×'+r.in[k]+'  '; left.appendChild(x);
  });
  var ar=document.createElement('div'); ar.className='arrow'; ar.textContent='→'; ar.style.padding='0 6px';
  var right=document.createElement('div'); right.className='rout';
  Object.keys(r.out).forEach(function(k){
    var t=+k, ic=iconFor(t); ic.style.width='22px'; ic.style.height='22px'; right.appendChild(ic);
    var x=document.createElement('span'); x.textContent='×'+r.out[k]; right.appendChild(x);
  });
  row.appendChild(left); row.appendChild(ar); row.appendChild(right);
  function doCraft(e){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    var ok=true;
    Object.keys(r.in).forEach(function(k){ if(invCount(+k)<r.in[k]) ok=false; });
    if(!ok){
      var miss=[];
      Object.keys(r.in).forEach(function(k){ var need=r.in[k], have=invCount(+k);
        if(have<need) miss.push(NAMES[+k]+' 需要'+need+' 有'+have); });
      toast('材料不足:'+miss.join('、'));
      return;
    }
    Object.keys(r.in).forEach(function(k){ invTake(+k, r.in[k]); });
    var outName='';
    Object.keys(r.out).forEach(function(k){ invAdd(+k, r.out[k]); outName=NAMES[+k]+' ×'+r.out[k]; });
    toast('合成成功:'+outName);
    sfxCraft();
    if(afterCraft) afterCraft();
  }
  row.addEventListener('click', doCraft);
  row.addEventListener('touchstart', doCraft, {passive:false});
  return row;
}
function openCraft(){
  var p=document.getElementById('craft'); if(!p) return;
  sfxUi();
  p.innerHTML='';
  var h=document.createElement('div'); h.className='ctitle';
  h.textContent='工作台 · 点击配方合成'; p.appendChild(h);
  RECIPES.forEach(function(r){ p.appendChild(makeRecipeRow(r, openCraft)); });
  var cls=document.createElement('div'); cls.className='cclose'; cls.textContent='关闭';
  cls.addEventListener('click', function(){ closeCraft(); });
  cls.addEventListener('touchstart', function(e){ e.preventDefault(); e.stopPropagation(); closeCraft(); }, {passive:false});
  p.appendChild(cls);
  p.style.display='block';
}
function closeCraft(){ var p=document.getElementById('craft'); if(p){ p.style.display='none'; p.innerHTML=''; } }
function selectSlot(i){
  selected=i;
  var s=document.querySelectorAll('#hotbar .slot');
  for(var k=0;k<s.length;k++) s[k].className='slot'+(k===i?' sel':'');
}

// ===================== 提示 =====================
var toastTimer=null;
function toast(msg){
  var el=document.getElementById('toast');
  if(!el){
    el=document.createElement('div'); el.id='toast';
    el.style.cssText='position:fixed;left:50%;top:60px;transform:translateX(-50%);background:rgba(0,0,0,.72);'+
      'color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;pointer-events:none;z-index:99;transition:opacity .3s';
    document.body.appendChild(el);
  }
  el.textContent=msg; el.style.opacity='1';
  clearTimeout(toastTimer); toastTimer=setTimeout(function(){el.style.opacity='0';},1500);
}

// ===================== 屏幕常亮(Screen Wake Lock API)=====================
var wakeLockOn=true, wakeLockObj=null, wakeLockPending=false;
var wakeLockSupported=!!(typeof navigator!=='undefined' && navigator.wakeLock && navigator.wakeLock.request);
try{ if(localStorage.getItem('voxel_awake')==='0') wakeLockOn=false; }catch(e){}
function wakeRequest(){
  if(!wakeLockOn||!wakeLockSupported||wakeLockObj||wakeLockPending) return;
  wakeLockPending=true;
  try{
    navigator.wakeLock.request('screen').then(function(sentinel){
      wakeLockPending=false;
      if(!wakeLockOn){ try{ sentinel.release(); }catch(e){} return; }
      wakeLockObj=sentinel;
      try{ sentinel.addEventListener('release',function(){ wakeLockObj=null; setPauseLabels(); }); }catch(e){}
      setPauseLabels();
    }).catch(function(){ wakeLockPending=false; });
  }catch(e){ wakeLockPending=false; }
}
function wakeRelease(){
  if(wakeLockObj){ try{ wakeLockObj.release(); }catch(e){} wakeLockObj=null; }
  setPauseLabels();
}
function setWakeLock(on){
  wakeLockOn=!!on;
  try{ localStorage.setItem('voxel_awake',wakeLockOn?'1':'0'); }catch(e){}
  if(wakeLockOn) wakeRequest(); else wakeRelease();
  setPauseLabels();
  toast(wakeLockOn
    ? ('屏幕常亮:'+(wakeLockSupported?'已开启':'浏览器不支持(需 https 或 127.0.0.1)'))
    : '屏幕常亮:已关闭');
  return wakeLockOn;
}
function wakeState(){ return !wakeLockSupported?'unsupported':(!wakeLockOn?'off':(wakeLockObj?'on':'pending')); }
try{
  if(typeof document!=='undefined' && document.addEventListener){
    document.addEventListener('visibilitychange',function(){ if(!document.hidden) wakeRequest(); });
  }
}catch(e){}

// ===================== 性能面板 =====================
var perfOn=false, perfT=0;
try{ if(localStorage.getItem('voxel_perf')==='1') perfOn=true; }catch(e){}
function setPerf(on){
  perfOn=!!on;
  try{ localStorage.setItem('voxel_perf',perfOn?'1':'0'); }catch(e){}
  var el=document.getElementById('perf'); if(el) el.style.display=perfOn?'block':'none';
  setPauseLabels();
  return perfOn;
}
function updatePerf(){
  var el=document.getElementById('perf'); if(!el) return;
  if(!perfOn){ el.style.display='none'; return; }
  el.style.display='block';
  var tris=0, calls=0;
  try{ tris=renderer.info.render.triangles|0; calls=renderer.info.render.calls|0; }catch(e){}
  var mem='';
  try{ if(performance.memory) mem=' · 内存 '+(performance.memory.usedJSHeapSize/1048576).toFixed(0)+'MB'; }catch(e){}
  el.textContent='FPS '+fps+' · 区块 '+chunkCache.size+' · 队列 '+meshQueue.length+
    ' · 三角面 '+(tris/1000).toFixed(1)+'k · 绘制 '+calls+' 次'+mem;
}

// ===================== 暂停 / 设置 =====================
var paused=false, lastLockChange=0;
function setPauseLabels(){
  var b;
  b=document.querySelector('#pause [data-act="sound"]');
  if(b){ b.textContent='音效:'+(soundOn?'开':'关'); b.className=soundOn?'on':''; }
  b=document.querySelector('#pause [data-act="map"]');
  if(b){ b.textContent='小地图:'+(minimapOn?'开':'关'); b.className=minimapOn?'on':''; }
  b=document.querySelector('#pause [data-act="perf"]');
  if(b){ b.textContent='性能面板:'+(perfOn?'开':'关'); b.className=perfOn?'on':''; }
  b=document.querySelector('#pause [data-act="slot"]');
  if(b){
    b.textContent='存档槽 '+slotN+'/3';
    b.className='';
  }
  b=document.querySelector('#pause [data-act="awake"]');
  if(b){
    var ws=wakeState();
    b.textContent='常亮:'+(ws==='unsupported'?'不支持':(ws==='off'?'关':(ws==='on'?'开':'…')));
    b.className=(ws==='on'||ws==='pending')?'on':'';
  }
  b=document.querySelector('#pause [data-act="fly"]');
  if(b){ b.textContent='飞行:'+(player.fly?'开':'关'); b.className=player.fly?'on':''; }
  b=document.getElementById('rdVal'); if(b) b.textContent=String(RENDER_R);
  b=document.querySelector('#pause [data-act="theme"]');
  if(b) b.textContent='材质:'+THEME_NAME[THEME];
}
function openPause(){
  if(paused) return;
  paused=true;
  closeBag(); closeCraft();
  touchMove.x=0; touchMove.y=0;
  var el=document.getElementById('pause'); if(el) el.style.display='block';
  try{ if(document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); }catch(e){}
  setPauseLabels(); sfxUi();
}
function closePause(){
  paused=false;
  var el=document.getElementById('pause'); if(el) el.style.display='none';
}
function togglePause(){ if(paused) closePause(); else openPause(); }
function setRenderDist(n){
  RENDER_R=Math.max(1,Math.min(5,n)); LOAD_R=RENDER_R+2;
  if(camera){ camera.far=Math.max(180, RENDER_R*CHUNK*2.6); try{ camera.updateProjectionMatrix(); }catch(e){} }
  lastPCX=1e9; if(typeof streamChunks==='function') streamChunks(true);
  setPauseLabels(); toast('视距 '+RENDER_R);
  return RENDER_R;
}
function setTimeOfDay(t){
  worldTime=Math.max(0,Math.min(0.999, t)); updateSky(0);
  toast('时间 '+clockText()+' · '+dayPhase());
}
function exportSave(){
  try{
    saveGame(true);
    var raw=localStorage.getItem(SAVE_KEY); if(!raw){ toast('没有存档可导出'); return false; }
    var blob=new Blob([raw],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download='voxel-world-'+clockText().replace(':','')+'.json';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ try{ document.body.removeChild(a); URL.revokeObjectURL(url); }catch(e){} },1200);
    toast('已导出存档('+(raw.length/1024).toFixed(1)+' KB)');
    return true;
  }catch(e){ toast('导出失败:'+e.message); return false; }
}
function importSaveFile(file){
  if(!file) return false;
  var fr=new FileReader();
  fr.onload=function(){
    try{
      var o=JSON.parse(String(fr.result));
      if(!o||!o.v) throw new Error('不是存档文件');
      localStorage.setItem(SAVE_KEY, JSON.stringify(o));
      toast('导入成功,正在重载…');
      setTimeout(function(){ try{ location.reload(); }catch(e){} },500);
    }catch(e){ toast('导入失败:'+e.message); }
  };
  fr.onerror=function(){ toast('读取文件失败'); };
  fr.readAsText(file);
  return true;
}
function bindPause(){
  var el=document.getElementById('pause'); if(!el) return;
  el.addEventListener('click',function(e){
    var t=e.target, b=null;
    while(t && t!==el){ if(t.getAttribute && t.getAttribute('data-act')){ b=t; break; } t=t.parentNode; }
    if(!b) return;
    e.preventDefault(); e.stopPropagation();
    var act=b.getAttribute('data-act'), v=b.getAttribute('data-v');
    if(act==='resume') closePause();
    else if(act==='save') saveGame(false);
    else if(act==='export') exportSave();
    else if(act==='import'){ var f=document.getElementById('importFile'); if(f) f.click(); }
    else if(act==='sound'){ toggleSound(); setPauseLabels(); }
    else if(act==='map'){ setMinimap(!minimapOn); setPauseLabels(); }
    else if(act==='fly'){ player.fly=!player.fly; player.vel.set(0,0,0); setPauseLabels(); }
    else if(act==='awake'){ setWakeLock(!wakeLockOn); }
    else if(act==='perf'){ setPerf(!perfOn); }
    else if(act==='slot'){ saveGame(true); useSlot(slotN>=3?1:slotN+1); try{ location.reload(); }catch(e){} }
    else if(act==='time'){ setTimeOfDay(parseFloat(v)); }
    else if(act==='rd'){ setRenderDist(RENDER_R+parseInt(v,10)); }
    else if(act==='theme'){ cycleTheme(); }
    else if(act==='menu'){ saveGame(true); try{ location.reload(); }catch(e){} }
  });
  var imp=document.getElementById('importFile');
  if(imp) imp.addEventListener('change',function(){ importSaveFile(imp.files&&imp.files[0]); });
  var bm=document.getElementById('bMenu');
  if(bm){
    bm.addEventListener('touchstart',function(e){e.preventDefault();e.stopPropagation();togglePause();},{passive:false});
    if(!('ontouchstart' in window)) bm.addEventListener('click',function(e){e.stopPropagation();togglePause();});
  }
}

// ===================== 输入 =====================
var keys={},touchMove={x:0,y:0},touchUp=false,touchDown=false;
var isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
function bindDesktop(){
  document.addEventListener('keydown',function(e){
    keys[e.code]=true;
    if(e.code==='F3'){ e.preventDefault(); setPerf(!perfOn); return; }
    if(e.code==='Escape'){ e.preventDefault(); if(nowSec()-lastLockChange>0.4) togglePause(); return; }
    if(e.code==='KeyF'){player.fly=!player.fly;player.vel.set(0,0,0);toast(player.fly?'飞行开启':'飞行关闭');}
    if(e.code==='KeyS'&&(e.ctrlKey||e.metaKey)){e.preventDefault();saveGame(false);}
    if(e.code==='Tab'){ e.preventDefault();
      var bp=document.getElementById('bag');
      if(bp && bp.style.display==='block') closeBag(); else openBag(); }
    if(e.code==='KeyE'){ var pp=document.getElementById('craft');
      if(pp && pp.style.display==='block') closeCraft(); else tryUse(); }
    if(e.code.indexOf('Digit')===0){var n=parseInt(e.code.substr(5),10)-1;if(n>=0&&n<HOTBAR_SIZE)selectSlot(n);}
    if(e.code==='Space')e.preventDefault();
  });
  document.addEventListener('keyup',function(e){keys[e.code]=false;});
  var canvas=renderer.domElement;
  canvas.addEventListener('click',function(){ if(paused) return; if(document.pointerLockElement!==canvas) canvas.requestPointerLock(); });
  document.addEventListener('mousemove',function(e){
    if(document.pointerLockElement!==canvas) return;
    player.yaw-=e.movementX*0.0024; player.pitch-=e.movementY*0.0024;
    var lim=Math.PI/2-0.01;
    if(player.pitch>lim)player.pitch=lim; if(player.pitch<-lim)player.pitch=-lim;
  });
  var breakTimer=null;
  canvas.addEventListener('mousedown',function(e){
    if(paused||document.pointerLockElement!==canvas) return;
    if(e.button===0){
      doBreak();
      if(breakTimer) clearInterval(breakTimer);
      breakTimer=setInterval(function(){ if(!paused) doBreak(); },230);
    }
    else if(e.button===2){
      var h=raycast(6);
      if(h && getBlock(h.x,h.y,h.z)===B.CRAFT) openCraft(); else doPlace();
    }
  });
  canvas.addEventListener('contextmenu',function(e){e.preventDefault();});
  // 浏览器按 ESC 会先解除鼠标锁定且不一定派发 keydown,这里兜底开暂停
  document.addEventListener('pointerlockchange',function(){
    lastLockChange=nowSec();
    if(document.pointerLockElement) return;
    if(paused||!started) return;
    var bp=document.getElementById('bag'), cp=document.getElementById('craft');
    if((bp&&bp.style.display==='block')||(cp&&cp.style.display==='block')) return;
    openPause();
  });
  document.addEventListener('mouseup',function(){ if(breakTimer){ clearInterval(breakTimer); breakTimer=null; } });
  window.addEventListener('blur',function(){ if(breakTimer){ clearInterval(breakTimer); breakTimer=null; } });
}
var stickEl,knobEl,stickId=null,lookId=null,lookLast=null;
function bindTouch(){
  document.getElementById('touch').style.display='block';
  stickEl=document.getElementById('stick'); knobEl=document.getElementById('knob');
  function stickSet(t){
    var r=stickEl.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
    var dx=t.clientX-cx,dy=t.clientY-cy,max=r.width/2-10,d=Math.hypot(dx,dy);
    if(d>max){dx=dx/d*max;dy=dy/d*max;}
    knobEl.style.left=(r.width/2-25+dx)+'px'; knobEl.style.top=(r.height/2-25+dy)+'px';
    touchMove.x=dx/max; touchMove.y=-dy/max;
  }
  function stickReset(){ knobEl.style.left='35px'; knobEl.style.top='35px'; touchMove.x=0; touchMove.y=0; stickId=null; }
  stickEl.addEventListener('touchstart',function(e){e.preventDefault();e.stopPropagation();stickId=e.changedTouches[0].identifier;stickSet(e.changedTouches[0]);},{passive:false});
  stickEl.addEventListener('touchmove',function(e){e.preventDefault();e.stopPropagation();
    for(var i=0;i<e.changedTouches.length;i++) if(e.changedTouches[i].identifier===stickId) stickSet(e.changedTouches[i]);
  },{passive:false});
  stickEl.addEventListener('touchend',function(e){e.preventDefault();e.stopPropagation();stickReset();},{passive:false});
  stickEl.addEventListener('touchcancel',function(){stickReset();},{passive:false});
  var canvas=renderer.domElement;
  var tapInfo=null;
  var repTimer=null;
  function stopRepeat(){ if(repTimer){ clearInterval(repTimer); repTimer=null; } }
  canvas.addEventListener('touchstart',function(e){
    if(paused) return;
    for(var i=0;i<e.changedTouches.length;i++){ var t=e.changedTouches[i];
      if(lookId===null){
        lookId=t.identifier; lookLast={x:t.clientX,y:t.clientY};
        tapInfo={id:t.identifier,x:t.clientX,y:t.clientY,t:Date.now(),moved:0,broke:false};
        var info=tapInfo;
        info.holdT=setTimeout(function(){
          if(tapInfo===info && info.moved<16){
            info.broke=true; doBreak();
            stopRepeat();
            repTimer=setInterval(function(){ if(!paused) doBreak(); },300);
          }
        },300);
      } }
  },{passive:true});
  canvas.addEventListener('touchmove',function(e){
    for(var i=0;i<e.changedTouches.length;i++){ var t=e.changedTouches[i];
      if(t.identifier===lookId&&lookLast){
        if(tapInfo && tapInfo.id===t.identifier)
          tapInfo.moved=Math.max(tapInfo.moved, Math.hypot(t.clientX-tapInfo.x, t.clientY-tapInfo.y));
        player.yaw-=(t.clientX-lookLast.x)*0.005; player.pitch-=(t.clientY-lookLast.y)*0.005;
        var lim=Math.PI/2-0.01;
        if(player.pitch>lim)player.pitch=lim; if(player.pitch<-lim)player.pitch=-lim;
        lookLast={x:t.clientX,y:t.clientY};
      } }
  },{passive:true});
  canvas.addEventListener('touchend',function(e){
    for(var i=0;i<e.changedTouches.length;i++){
      var t=e.changedTouches[i];
      if(t.identifier===lookId){
        if(tapInfo && tapInfo.id===t.identifier){
          if(tapInfo.holdT) clearTimeout(tapInfo.holdT);
          stopRepeat();
          var moved=tapInfo.moved;
          if(!tapInfo.broke && moved<14) doTapAction();   // 短点:放置 / 打开工作台
        }
        lookId=null; lookLast=null; tapInfo=null;
      }
    }
  },{passive:true});
  function holdBtn(id,onDown,onUp){
    var el=document.getElementById(id);
    el.addEventListener('touchstart',function(e){e.preventDefault();e.stopPropagation();onDown();},{passive:false});
    el.addEventListener('touchend',function(e){e.preventDefault();e.stopPropagation();if(onUp)onUp();},{passive:false});
    el.addEventListener('touchcancel',function(){if(onUp)onUp();},{passive:false});
  }
  holdBtn('bJump',function(){touchUp=true;},function(){touchUp=false;});
  function mineBtn(){
    var el=document.getElementById('bBreak'); if(!el) return;
    el.addEventListener('touchstart',function(e){ e.preventDefault(); e.stopPropagation();
      if(paused) return; doBreak();
      stopRepeat(); repTimer=setInterval(function(){ if(!paused) doBreak(); },300);
    },{passive:false});
    el.addEventListener('touchend',function(e){ e.preventDefault(); e.stopPropagation(); stopRepeat(); },{passive:false});
    el.addEventListener('touchcancel',function(){ stopRepeat(); },{passive:false});
  }
  mineBtn();
  var placeEl=document.getElementById('bPlace');
  if(placeEl) placeEl.addEventListener('touchstart',function(e){ e.preventDefault(); e.stopPropagation(); if(!paused) doPlace(); },{passive:false});
  document.getElementById('bBag').addEventListener('touchstart',function(e){e.preventDefault();e.stopPropagation();openBag();},{passive:false});
  var bTheme=document.getElementById('bTheme');
  if(bTheme){
    bTheme.addEventListener('touchstart',function(e){e.preventDefault();e.stopPropagation();cycleTheme();},{passive:false});
    if(!('ontouchstart' in window)) bTheme.addEventListener('click',function(e){e.stopPropagation();cycleTheme();});
  }
  document.getElementById('bFly').addEventListener('touchstart',function(e){
    e.preventDefault(); e.stopPropagation();
    player.fly=!player.fly; player.vel.set(0,0,0);
    document.getElementById('bFly').style.background=player.fly?'rgba(110,190,48,.6)':'rgba(255,255,255,.2)';
  },{passive:false});
}

// ===================== 自适应画质 =====================
var lowFps=0, qualityDropped=false;
function adaptQuality(){
  if(fps>0 && fps<24) lowFps++; else if(lowFps>0) lowFps--;
  if(!qualityDropped && lowFps>=6){
    qualityDropped=true;
    try{ renderer.setPixelRatio(1); renderer.setSize(innerWidth,innerHeight); }catch(e){}
    if(isTouch) setRenderDist(Math.max(2,RENDER_R-1));
    toast('已自动降低画质以保持流畅');
  }
}

// ===================== 主循环 =====================
var last=0,frames=0,fpsTime=0,fps=0;
function loop(t){
  requestAnimationFrame(loop);
  if(!last) last=t;
  var dt=Math.min((t-last)/1000,0.05); last=t;
  if(!paused){
    updatePlayer(dt);
    updateSky(dt);
    updateMobs(dt);
    mapAcc+=dt; if(mapAcc>=0.35){ mapAcc=0; drawMinimap(); }
    if(health>0 && health<maxHealth && nowSec()-lastHurtAt>12){
      regenAcc+=dt; if(regenAcc>4){ regenAcc=0; health=Math.min(maxHealth,health+1); heartsUi(); }
    }
    streamChunks(false);
    updateHighlight();
    flushMeshBudget(5);
  }
  renderer.render(scene,camera);
  frames++; fpsTime+=dt;
  if(fpsTime>=0.5){
    fps=Math.round(frames/fpsTime); frames=0; fpsTime=0;
    adaptQuality();
    updatePerf();
    var p=player.pos;
    document.getElementById('info').textContent=
      'FPS '+fps+' · xyz '+p.x.toFixed(1)+','+p.y.toFixed(1)+','+p.z.toFixed(1)+
      ' · 手持:'+(NAMES[hotSlots[selected]]||'')+(player.fly?' · 飞行':'')+
      ' · '+clockText()+(dayPhase()?' · '+dayPhase():'');
  }
}

// ===================== 启动 =====================
var started=false;
function init(mode){
  if(started) return; started=true;
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x8fc9f5);
  scene.fog=new THREE.Fog(0x8fc9f5,45,110);
  camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,0.1,220);
  camera.rotation.order='YXZ';
  renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'default'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,isTouch?1.5:2));
  renderer.setSize(innerWidth,innerHeight);
  document.body.insertBefore(renderer.domElement,document.getElementById('hud'));

  makeAtlas();
  matOpaque=new THREE.MeshBasicMaterial({map:atlasTex,vertexColors:true,side:THREE.DoubleSide});
  matWater=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:0.72,depthWrite:false});
  matGlass=new THREE.MeshBasicMaterial({map:atlasTex,vertexColors:true,side:THREE.DoubleSide,
                                        transparent:true,alphaTest:0.12,depthWrite:true});
  makePlantAtlas();
  matPlant=new THREE.MeshBasicMaterial({map:plantTex,vertexColors:true,side:THREE.DoubleSide,
                                        transparent:true,alphaTest:0.45,depthWrite:true});
  matGlow=new THREE.MeshBasicMaterial({vertexColors:true,blending:THREE.AdditiveBlending,
                                       transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false});

  buildSky();
  updateSky(0);

  var gg=new THREE.BoxGeometry(1.002,1.002,1.002);
  highlight=new THREE.LineSegments(new THREE.EdgesGeometry(gg),new THREE.LineBasicMaterial({color:0x000000}));
  highlight.visible=false; scene.add(highlight);

  var loaded=false;
  if(mode!=='new') loaded=loadGame();
  if(!loaded){ player.pos.set(8.5,20,8.5); inv={ 8:8, 11:8 }; }   // 8 木板 + 8 圆石

  // 出生点落地
  var sx=Math.floor(player.pos.x), sz=Math.floor(player.pos.z);
  var sp=terrainAt(sx,sz);
  if(!loaded) player.pos.y=sp.h+1.2;
  spawnPt={x:player.pos.x,y:player.pos.y,z:player.pos.z};
  heartsUi();
  initMobs();
  camera.position.set(player.pos.x,player.pos.y+EYE,player.pos.z);

  streamChunks(true);
  // 首批网格同步生成(保证脚下有地面)
  while(meshQueue.length) flushMeshQueue(64);

  audioInit();
  wakeRequest();
  initMinimap();
  drawMinimap();
  bindPause();
  setPauseLabels();
  bindDesktop();
  if(isTouch) bindTouch();
  buildHotbar();
  document.getElementById('help').textContent=isTouch
    ? '摇杆走 · 拖动看 · 点=放 · 按住=连续挖 · 右下"挖/放"按钮 · 菜单可调设置'
    : 'WASD 移动 · Ctrl 冲刺 · 空格跳 · F 飞行 · 1~9 选槽 · 按住左键连续挖 / 右键放 · Tab 背包 · ESC 暂停';
  addEventListener('resize',function(){
    camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  });
  document.getElementById('start').style.display='none';
  requestAnimationFrame(loop);
  setInterval(function(){saveGame(true);},20000);
  document.addEventListener('visibilitychange',function(){ if(document.hidden) saveGame(true); });
  toast(loaded?'已载入存档':'无限世界 · 每 20 秒自动存档');
}
document.getElementById('go').addEventListener('click',function(){try{init('auto');}catch(e){showErr(e);}});
document.getElementById('loadBtn').addEventListener('click',function(){try{init('load');}catch(e){showErr(e);}});
document.getElementById('newBtn').addEventListener('click',function(){try{localStorage.removeItem(SAVE_KEY);init('new');}catch(e){showErr(e);}});

// 开始界面:材质切换
Array.prototype.forEach.call(document.querySelectorAll('#start [data-theme]'),function(b){
  b.addEventListener('click',function(){
    var t=b.getAttribute('data-theme')||'round';
    try{
      var base=String((typeof location!=='undefined'&&location.pathname)||'index.html');
      location.href=(t==='round')?base:(base+'?theme='+t);
    }catch(e){}
  });
});

function showErr(err){
  var el=document.getElementById('err'); el.style.display='block';
  el.textContent='初始化失败：'+err.message+'\n'+(err.stack||'');
}
})();
