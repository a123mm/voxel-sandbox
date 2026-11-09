const fs=require('fs');
const src=fs.readFileSync('game.js','utf8');
const a=src.indexOf('function rgbOf(');
const b=src.indexOf('function mobMats(');
const block=src.slice(a,b);
const S=32;
const MOB_TYPES={sheep:{body:0xf0f0f0},pig:{body:0xe4918f}};
const prand=s=>{const x=Math.sin(s*127.1+311.7)*43758.5453;return x-Math.floor(x);};
let buf=null;
function ctxFor(px){
  let cur=[0,0,0];
  return { set fillStyle(v){const m=/rgba?\(([^)]+)\)/.exec(v); const p=m?m[1].split(',').map(Number):[0,0,0]; cur=[p[0]|0,p[1]|0,p[2]|0];},
    get fillStyle(){return '';},
    fillRect(x,y,w,h){ for(let j=0;j<h;j++)for(let i=0;i<w;i++){ const X=x+i,Y=y+j; if(X<0||Y<0||X>=S||Y>=S) continue; const o=(Y*S+X)*4; px[o]=cur[0];px[o+1]=cur[1];px[o+2]=cur[2];px[o+3]=255; } } };
}
function render(type,part){
  const px=new Uint8Array(S*S*4);
  const doc={ createElement:()=>({ width:0, height:0, getContext:()=>ctxFor(px) }) };
  const THREE={ CanvasTexture:class{constructor(){}}, NearestFilter:1 };
  const fn=new Function('document','THREE','prand','MOB_TYPES','type','part','S', block + '\n return makeMobTex(type,part);');
  fn(doc,THREE,prand,MOB_TYPES,type,part,S);
  return px;
}
const out=[];
for(const t of ['sheep','pig']) for(const p of ['body','face']) out.push(Buffer.from(render(t,p)));
fs.writeFileSync('_preview/mobtex.bin', Buffer.concat(out));
console.log('渲染完成:', out.length, '张');
