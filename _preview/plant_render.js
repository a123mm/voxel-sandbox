const fs=require('fs');
const src=fs.readFileSync('game.js','utf8');
const a=src.indexOf('function makePlantAtlas(){');
const b=src.indexOf('plantTex=new THREE.CanvasTexture(plantCanvas);');
const body=src.slice(a,b);
const S=32, TILES=3, px=new Uint8Array(S*TILES*S*4);
function parse(c){ const m=/rgba?\(([^)]+)\)/.exec(c); if(!m) return [0,0,0,0]; const p=m[1].split(',').map(Number); return [p[0]|0,p[1]|0,p[2]|0,p.length>3?p[3]:1]; }
let cur=[0,0,0,1];
const ctx={ set fillStyle(v){cur=parse(v);}, get fillStyle(){return '';},
  fillRect(x,y,w,h){ for(let j=0;j<h;j++)for(let i=0;i<w;i++){ const X=x+i,Y=y+j; if(X<0||Y<0||X>=S||Y>=S*TILES)continue; const o=(Y*S+X)*4; px[o]=cur[0];px[o+1]=cur[1];px[o+2]=cur[2];px[o+3]=255; } },
  clearRect(x,y,w,h){ for(let j=0;j<h;j++)for(let i=0;i<w;i++){ const o=((y+j)*S+x+i)*4; px[o]=px[o+1]=px[o+2]=px[o+3]=0; } } };
const fakeDoc={ createElement:()=>({ getContext:()=>ctx, width:0, height:0 }) };
const fn=new Function('document','PLANT_PX','PLANT_TILES','THREE','px', body + '\n}\n makePlantAtlas();');
fn(fakeDoc, S, TILES, {CanvasTexture:class{ constructor(){} }}, px);
fs.writeFileSync('_preview/plants_raw.bin', Buffer.from(px));
console.log('渲染完成, 不透明像素:', Array.from(px).filter((v,i)=>i%4===3&&v>0).length);
