import fs from 'node:fs';
import { feature, mesh } from 'topojson-client';
import { geoEqualEarth, geoNaturalEarth1, geoPath, geoGraticule10, geoContains } from 'd3-geo';
const W=1600,H=2000;
const topo=JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-50m.json'));
const countries=feature(topo,topo.objects.countries);
countries.features=countries.features.filter(f=>f.properties.name!=='Antarctica');
const borders=mesh(topo,topo.objects.countries,(a,b)=>a!==b);
const landTopo=JSON.parse(fs.readFileSync('node_modules/world-atlas/land-110m.json'));
const land={type:'FeatureCollection',features:countries.features};
const fontDir='file://'+process.cwd()+'/node_modules/@fontsource';
const fonts=`
@font-face{font-family:CG;src:url(${fontDir}/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2)}
@font-face{font-family:CG;font-style:italic;src:url(${fontDir}/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff2)}
@font-face{font-family:CG;font-weight:500;src:url(${fontDir}/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2)}
@font-face{font-family:PM;src:url(${fontDir}/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2)}
*{margin:0;padding:0;box-sizing:border-box}body{width:${W}px;height:${H}px;overflow:hidden}
.eb{font-family:PM;font-size:24px;letter-spacing:.32em;text-transform:uppercase}
.t{font-family:CG;font-weight:400;font-size:178px;line-height:.92;letter-spacing:-.01em}
.it{font-style:italic}
`;
function mapSvg(w,h,{bg='none',landFill,stroke,sw=0.7,grat,gratW=0.6,outline,pad=0,proj='ee'}){
  const p=(proj==='ne'?geoNaturalEarth1():geoEqualEarth()).fitExtent([[pad,pad],[w-pad,h-pad]],{type:'Sphere'});
  const g=geoPath(p);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  ${outline?`<path d="${g({type:'Sphere'})}" fill="${bg}" stroke="${outline}" stroke-width="1"/>`:''}
  ${grat?`<path d="${g(geoGraticule10())}" fill="none" stroke="${grat}" stroke-width="${gratW}"/>`:''}
  <path d="${g(countries)}" fill="${landFill}" stroke="none"/>
  <path d="${g(borders)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
  <path d="${g(countries)}" fill="none" stroke="${stroke}" stroke-width="${sw*1.4}" stroke-linejoin="round"/>
  </svg>`;
}
function dotSvg(w,h,color,step=17,r=5.2){
  const p=geoEqualEarth().fitExtent([[0,0],[w,h]],{type:'Sphere'});
  let dots='';
  for(let y=step/2;y<h;y+=step)for(let x=step/2;x<w;x+=step){
    const ll=p.invert([x,y]); if(!ll||ll[1]<-58||ll[1]>83)continue; const bk=p(ll); if(!bk||Math.hypot(bk[0]-x,bk[1]-y)>1)continue;
    if(geoContains(land,ll)) dots+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`;
  }
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><g fill="${color}">${dots}</g></svg>`;
}
const pages={
E:`<body style="background:#1E3529;color:#F4F1EB">
 <div style="position:absolute;left:120px;top:120px;color:#C9A96E" class="eb">N°98 Maps</div>
 <div style="position:absolute;left:112px;top:230px" class="t">Custom<br>Map <span class="it">Print</span></div>
 <div style="position:absolute;left:0;top:860px;width:1600px;display:flex;justify-content:center">${mapSvg(1460,720,{landFill:'#2A4838',stroke:'#E9DFC9',sw:0.7,grat:'#2C4A3A',outline:'#C9A96E',bg:'#1E3529'})}</div>
 <div style="position:absolute;left:120px;right:120px;bottom:120px;display:flex;justify-content:space-between;border-top:1px solid #C9A96E;padding-top:28px;color:#C9A96E" class="eb"><span>Any place on earth</span><span>Printed to order</span></div>
</body>`,
F:`<body style="background:#F4F1EB;color:#141414">
 <div style="position:absolute;inset:70px;border:1px solid #141414"></div>
 <div style="position:absolute;inset:84px;border:1px solid #141414"></div>
 <div style="position:absolute;left:130px;right:130px;top:130px;display:flex;justify-content:space-between" class="eb"><span>N°98 Maps</span><span>Plate I</span></div>
 <div style="position:absolute;left:0;top:300px;width:1600px;display:flex;justify-content:center">${mapSvg(1360,680,{landFill:'#E4DDD0',stroke:'#141414',sw:0.8,grat:'#D6CFC2',outline:'#141414',bg:'#F4F1EB'})}</div>
 <div style="position:absolute;left:0;width:1600px;text-align:center;top:1110px;font-family:PM;font-size:20px;letter-spacing:.3em;color:#47433C">0° N · 0° E</div>
 <div style="position:absolute;left:0;width:1600px;text-align:center;top:1290px" class="t">Custom Map <span class="it">Print</span></div>
 <div style="position:absolute;left:0;width:1600px;text-align:center;top:1520px;font-family:CG;font-style:italic;font-size:48px;color:#47433C">Any place on earth, drawn just for you.</div>
 <div style="position:absolute;left:130px;right:130px;bottom:130px;display:flex;justify-content:space-between" class="eb"><span>Designed by you</span><span>Printed to order</span></div>
</body>`,
G:`<body style="background:#F4F1EB;color:#141414">
 <div style="position:absolute;left:0;top:0;width:1600px;height:900px;background:#1E3529"></div>
 <div style="position:absolute;left:0;width:1600px;text-align:center;top:170px;color:#C9A96E" class="eb">N°98 Maps</div>
 <div style="position:absolute;left:0;width:1600px;text-align:center;top:270px;color:#F4F1EB" class="t">Custom Map<br><span class="it">Print</span></div>
 <div style="position:absolute;left:0;top:980px;width:1600px;display:flex;justify-content:center">${mapSvg(1440,720,{landFill:'#E4DDD0',stroke:'#141414',sw:0.8,grat:'#D6CFC2',outline:'#141414',bg:'#F4F1EB'})}</div>
 <div style="position:absolute;left:0;width:1600px;text-align:center;bottom:110px" class="eb">Any place on earth · Printed to order</div>
</body>`,
H:`<body style="background:#141414;color:#F4F1EB">
 <div style="position:absolute;left:0;width:1600px;text-align:center;top:150px;color:#C9A96E" class="eb">N°98 Maps</div>
 <div style="position:absolute;left:0;width:1600px;text-align:center;top:250px" class="t">Custom Map<br><span class="it" style="color:#C9A96E">Print</span></div>
 <div style="position:absolute;left:0;top:820px;width:1600px;display:flex;justify-content:center">${mapSvg(1440,740,{landFill:'#1F1F1D',stroke:'#E9DFC9',sw:0.65,grat:'#262624',outline:'#C9A96E',bg:'#141414'})}</div>
 <div style="position:absolute;left:300px;right:300px;bottom:150px;border-top:1px solid #3A3833"></div>
 <div style="position:absolute;left:0;width:1600px;text-align:center;bottom:100px;color:#C9A96E" class="eb">Designed by you · Printed to order</div>
</body>`,
};

for(const [k,body] of Object.entries(pages)) fs.writeFileSync(`hero-${k}.html`,`<!doctype html><html><head><meta charset="utf-8"><style>${fonts}</style></head>${body}</html>`);
