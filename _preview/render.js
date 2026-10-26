const fs=require('fs');
const src=fs.readFileSync('game.js','utf8');
const a=src.indexOf('// ============ 原创');
const b=src.indexOf('function drawBenchOverlay(');
const block=src.slice(a, src.indexOf('\n}', b)+2);
const S=32, N=15;
const px=new Uint8Array(S*N*S*4);
function parse(css){
  const m=/rgba?\(([^)]+)\)/.exec(css); if(!m) return [0,0,0,0];
  const p=m[1].split(',').map(Number);
  return [p[0]|0,p[1]|0,p[2]|0,p.length>3?p[3]:1];
}
let cur=[0,0,0,1];
const ctx={
  set fillStyle(v){ cur=parse(v); }, get fillStyle(){ return ''; },
  fillRect(x,y,w,h){ for(let j=0;j<h;j++)for(let i=0;i<w;i++){
      const X=x+i,Y=y+j; if(X<0||Y<0||X>=S||Y>=S*N) continue;
      const o=(Y*S+X)*4, al=cur[3]; if(al<=0) continue;
      if(al>=1){px[o]=cur[0];px[o+1]=cur[1];px[o+2]=cur[2];px[o+3]=255;}
      else {px[o]=px[o]*(1-al)+cur[0]*al;px[o+1]=px[o+1]*(1-al)+cur[1]*al;px[o+2]=px[o+2]*(1-al)+cur[2]*al;px[o+3]=Math.max(px[o+3],al*255);} } },
  clearRect(x,y,w,h){ for(let j=0;j<h;j++)for(let i=0;i<w;i++){const o=((y+j)*S+x+i)*4;px[o]=px[o+1]=px[o+2]=px[o+3]=0;} },
  drawImage(){}, imageSmoothingEnabled:false,
};
const wrapped=new Function('TILE_PX','TILES','ctx','px','Math',
  'function prand(seed){ var x=Math.sin(seed*127.1+311.7)*43758.5453; return x-Math.floor(x); }\n'+block+'\ndrawRoundAtlas(ctx);');
wrapped(S,N,ctx,px,Math);
fs.writeFileSync('_preview/atlas_raw.bin', Buffer.from(px));
console.log('ok');
