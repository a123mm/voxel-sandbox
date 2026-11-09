const fs=require('fs');
const src=fs.readFileSync('game.js','utf8');
const a=src.indexOf('function rgbOf(');
const b=src.indexOf('function mobMats(');
const block=src.slice(a,b);
const S=32;
function render(type,part){
  const px=new Uint8Array(S*S*4);
  let cur=[0,0,0,1];
  const ctx={ set fillStyle(v){const m=/rgba?\(([^)]+)\)/.exec(v); const p=m?m[1].split(',').map(Number):[255,0,255]; cur=[p[0]|0,p[1]|0,p[2]|0,p[3]??1];},
    get fillStyle(){return '';},
    fillRect(x,y,w,h){for(let j=0;j<h;j++)for(let i=0;i<w;i++){const X=x+i,Y=y+j; if(X<0||Y<0||X>=S||Y>=S)continue; const o=(Y*S+X)*4; px[o]=cur[0];px[o+1]=cur[1];px[o+2]=cur[2];px[o+3]=255;}},
    clearRect(){}
  };
  const doc={createElement:()=>({getContext:()=>ctx,width:0,height:0})};
  const THREE={CanvasTexture:class{constructor(){}},NearestFilter:1};
  const fn=new Function('document','THREE','S','prand','MOB_TYPES','rgbOf','part','type',
    block + '\nreturn makeMobTex(type, part);');
  const MOB_TYPES={sheep:{body:0xf0f0f0,head:0xdcdcdc,leg:0xbcbcbc},pig:{body:0xe4918f,head:0xd67f7d,leg:0xbf6a68}};
  const prand=s=>{const x=Math.sin(s*127.1+311.7)*43758.5453;return x-Math.floor(x);};
  // 直接执行块内函数,靠闭包拿到 px: 通过重写 fillRect?? 简化:再包一层
  const wrapped=new Function('document','THREE','prand','MOB_TYPES','type','part', block + '\n makeMobTex(type,part);');
  wrapped(doc,THREE,prand,MOB_TYPES,type,part);
  return px;
}
const out=Buffer.concat([ [ 'sheep','pig' ].map(t=>Buffer.from(render(t,'body')) ) ]);
fs.writeFileSync('_preview/mob_body.bin', out);
const faces=Buffer.concat([ [ 'sheep','pig' ].map(t=>Buffer.from(render(t,'face')) ) ]);
fs.writeFileSync('_preview/mob_face.bin', faces);
console.log('渲染完成');
