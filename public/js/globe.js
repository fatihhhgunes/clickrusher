'use strict';
// ── SEEDS ────────────────────────────────────────────────────────────────
function fibSphere(n){
  const pts=[],phi=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<n;i++){const y=1-(i/(n-1))*2,r=Math.sqrt(1-y*y),t=phi*i;pts.push([r*Math.cos(t),y,r*Math.sin(t)]);}
  return pts;
}
const seeds=fibSphere(48);
TEAMS.forEach((t,i)=>{t.seed=seeds[i];});

// ── THREE.JS ──────────────────────────────────────────────────────────────
const cvs=document.getElementById('globe-canvas');
const GW=Math.min(window.innerWidth-24,505),GH=395;
const renderer=new THREE.WebGLRenderer({canvas:cvs,antialias:true,alpha:true});
renderer.setSize(GW,GH);renderer.setPixelRatio(Math.min(devicePixelRatio*1.5,3));
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(42,GW/GH,.1,100);
camera.position.z=2.9;

const N=48;
function makeDTex(arr){const t=new THREE.DataTexture(arr,N,1,THREE.RGBAFormat,THREE.UnsignedByteType);t.needsUpdate=true;return t;}
const sArr=new Uint8Array(N*4),c1A=new Uint8Array(N*4),c2A=new Uint8Array(N*4);
TEAMS.forEach((t,i)=>{
  sArr[i*4+0]=Math.round((t.seed[0]+1)*127.5);sArr[i*4+1]=Math.round((t.seed[1]+1)*127.5);
  sArr[i*4+2]=Math.round((t.seed[2]+1)*127.5);sArr[i*4+3]=255;
  c1A[i*4+0]=t.c1[0];c1A[i*4+1]=t.c1[1];c1A[i*4+2]=t.c1[2];c1A[i*4+3]=255;
  c2A[i*4+0]=t.c2[0];c2A[i*4+1]=t.c2[1];c2A[i*4+2]=t.c2[2];c2A[i*4+3]=255;
});
const sTex=makeDTex(sArr),c1Tex=makeDTex(c1A),c2Tex=makeDTex(c2A);

const VERT=`
varying vec3 vPos;varying vec3 vNrm;varying vec2 vUV;
void main(){vPos=normalize(position);vNrm=normalize(normalMatrix*normal);vUV=uv;
gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

const INNER_LIGHT=`
  float bd=md-sd;
  float coronaW=0.09;
  if(bd<coronaW){
    float ct=1.0-bd/coronaW;
    float cg=pow(ct,3.0);
    float breathe=0.5+0.5*sin(time*1.8+nu*15.0);
    vec3 warmGlow=vec3(1.0,0.58+0.12*breathe,0.04);
    fc=mix(fc,warmGlow*2.5,cg*0.38);
  }
  float crackW=0.008;
  if(bd<crackW){
    float t=1.0-bd/crackW;
    float g=pow(t,0.6);
    float flicker=0.5+0.5*sin(time*5.0+nu*40.0);
    vec3 hotCore=mix(vec3(1.0,0.82,0.3),vec3(1.0,1.0,0.95),pow(g,0.4));
    float brightness=3.5+1.5*flicker*g;
    fc=mix(fc,hotCore*brightness,g*0.99);
  }
  float lit=0.5+0.5*dot(vNrm,normalize(vec3(0.4,0.6,1.0)));
  fc*=(0.58+0.42*lit);
  float fr=1.0-abs(dot(vNrm,vec3(0.,0.,1.)));fr=fr*fr*fr;
  fc=mix(fc,vec3(1.0,0.58,0.08)*1.6,fr*0.28);
  gl_FragColor=vec4(fc,1.0);`;

const FRAG_COLOR=`
uniform sampler2D sTex,c1Tex,c2Tex;uniform float time;
varying vec3 vPos,vNrm;varying vec2 vUV;
const int N=48;
float tu(int i){return(float(i)+.5)/float(N);}
vec3 seed(float u){return texture2D(sTex,vec2(u,.5)).rgb*2.-1.;}
void main(){
  vec3 dir=vPos;float md=-2.,sd=-2.,nu=0.;
  for(int i=0;i<N;i++){float u=tu(i);float d=dot(dir,seed(u));if(d>md){sd=md;md=d;nu=u;}else if(d>sd){sd=d;}}
  vec3 c1=texture2D(c1Tex,vec2(nu,.5)).rgb;
  vec3 c2=texture2D(c2Tex,vec2(nu,.5)).rgb;
  vec3 s=seed(nu);vec3 rt=normalize(cross(s,vec3(0.,1.,0.)));if(length(rt)<.01)rt=vec3(1.,0.,0.);
  vec3 lu=normalize(cross(rt,s));
  float pv=dot(dir,lu)*5.;float st=fract(pv+1.5);
  vec3 fc;if(st<.333)fc=c1;else if(st<.667)fc=mix(c1,c2,.5);else fc=c2;
  ${INNER_LIGHT}}`;

const FRAG_FLAG=`
uniform sampler2D flagTex,sTex;uniform float time;
varying vec3 vPos,vNrm;varying vec2 vUV;
const int N=48;
float tu(int i){return(float(i)+.5)/float(N);}
vec3 seed(float u){return texture2D(sTex,vec2(u,.5)).rgb*2.-1.;}
void main(){
  vec3 dir=vPos;float md=-2.,sd=-2.,nu=0.;
  for(int i=0;i<N;i++){float u=tu(i);float d=dot(dir,seed(u));if(d>md){sd=md;md=d;nu=u;}else if(d>sd){sd=d;}}
  vec3 fc=texture2D(flagTex,vUV).rgb;
  ${INNER_LIGHT}}`;

const matColor=new THREE.ShaderMaterial({
  vertexShader:VERT,fragmentShader:FRAG_COLOR,
  uniforms:{sTex:{value:sTex},c1Tex:{value:c1Tex},c2Tex:{value:c2Tex},time:{value:0}}
});
const globe=new THREE.Mesh(new THREE.SphereGeometry(1,96,96),matColor);
scene.add(globe);
const atm=new THREE.Mesh(new THREE.SphereGeometry(1.1,32,32),
  new THREE.MeshBasicMaterial({color:0xFF8800,transparent:true,opacity:.07,side:THREE.BackSide}));
scene.add(atm);

let drag=false,auto=true,vx=0,vy=0,px=0,py=0,cs={x:0,y:0},spinDir=0;
cvs.addEventListener('mousedown',e=>{drag=true;auto=false;px=e.clientX;py=e.clientY;vx=0;vy=0;spinDir=0;cs={x:e.clientX,y:e.clientY};});
window.addEventListener('mousemove',e=>{if(!drag)return;const dx=e.clientX-px,dy=e.clientY-py;vy=dx*.006;vx=dy*.006;globe.rotation.x+=vx;globe.rotation.y+=vy;atm.rotation.copy(globe.rotation);px=e.clientX;py=e.clientY;});
window.addEventListener('mouseup',e=>{if(!drag)return;drag=false;spinDir=Math.abs(vy)>0.002?(vy>0?1:-1):0;if(Math.hypot(e.clientX-cs.x,e.clientY-cs.y)<6)handleGlobeClick(e);});
cvs.addEventListener('touchstart',e=>{e.preventDefault();drag=true;auto=false;px=e.touches[0].clientX;py=e.touches[0].clientY;vx=0;vy=0;spinDir=0;cs={x:px,y:py};},{passive:false});
cvs.addEventListener('touchmove',e=>{e.preventDefault();if(!drag)return;const dx=e.touches[0].clientX-px,dy=e.touches[0].clientY-py;vy=dx*.006;vx=dy*.006;globe.rotation.x+=vx;globe.rotation.y+=vy;atm.rotation.copy(globe.rotation);px=e.touches[0].clientX;py=e.touches[0].clientY;},{passive:false});
cvs.addEventListener('touchend',e=>{drag=false;spinDir=Math.abs(vy)>0.002?(vy>0?1:-1):0;const t=e.changedTouches[0];if(Math.hypot(t.clientX-cs.x,t.clientY-cs.y)<8)handleGlobeClick(t);});

function handleGlobeClick(e){
  const rect=cvs.getBoundingClientRect();
  const ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1),camera);
  const hits=ray.intersectObject(globe);if(!hits.length)return;
  const local=hits[0].point.clone().applyQuaternion(globe.quaternion.clone().invert()).normalize();
  let best=-1,bd=-2;
  TEAMS.forEach((t,i)=>{const d=local.dot(new THREE.Vector3(...t.seed));if(d>bd){bd=d;best=i;}});
  if(best>=0)openModal(TEAMS[best]);
}

const clk=new THREE.Clock();
(function loop(){
  requestAnimationFrame(loop);
  if(globe.material.uniforms)globe.material.uniforms.time.value=clk.getElapsedTime();
  if(!drag){vx*=.96;vy*=.98;if(spinDir!==0&&Math.abs(vy)<0.0024)vy=0.0024*spinDir;globe.rotation.x+=vx;globe.rotation.y+=vy;if(auto)globe.rotation.y+=.0025;atm.rotation.copy(globe.rotation);}
  renderer.render(scene,camera);
})();

async function buildFlagTexture(flagImgs){
  const TW=1024,TH=512;
  const c=document.createElement('canvas');c.width=TW;c.height=TH;
  const ctx=c.getContext('2d');
  const FW=320,FH=200;
  const fdata={};
  TEAMS.forEach(t=>{
    if(!flagImgs[t.fc])return;
    const fc=document.createElement('canvas');fc.width=FW;fc.height=FH;
    const fctx=fc.getContext('2d');fctx.drawImage(flagImgs[t.fc],0,0,FW,FH);
    try{fdata[t.fc]=fctx.getImageData(0,0,FW,FH).data;}catch(e){}
  });
  const imgd=ctx.createImageData(TW,TH);const p=imgd.data;
  const sv=TEAMS.map(t=>t.seed);
  for(let py2=0;py2<TH;py2++){
    const phi=(py2/TH)*Math.PI;
    const sinPhi=Math.sin(phi),cosPhi=Math.cos(phi);
    for(let ppx=0;ppx<TW;ppx++){
      const theta=(ppx/TW)*2*Math.PI;
      const x=-sinPhi*Math.cos(theta),y=cosPhi,z=sinPhi*Math.sin(theta);
      let md=-2,ni=0;
      for(let i=0;i<48;i++){const s=sv[i],d=x*s[0]+y*s[1]+z*s[2];if(d>md){md=d;ni=i;}}
      const pidx=(py2*TW+ppx)*4;
      const team=TEAMS[ni];
      const fd=fdata[team.fc];
      if(fd){
        const s=sv[ni];
        const rLen=Math.sqrt(s[2]*s[2]+s[0]*s[0]);
        let nrx,nrz;if(rLen>.001){nrx=s[2]/rLen;nrz=-s[0]/rLen;}else{nrx=1;nrz=0;}
        const ux=0*s[2]-nrz*s[1];const uy=nrz*s[0]-nrx*s[2];const uz=nrx*s[1];
        const uLen=Math.sqrt(ux*ux+uy*uy+uz*uz);
        const nux=ux/uLen,nuy=uy/uLen,nuz=uz/uLen;
        const ph=x*nrx+z*nrz;const pv2=x*nux+y*nuy+z*nuz;
        const scale=2.8;
        const fu=Math.max(0,Math.min(1,ph*scale+0.5));
        const fv=Math.max(0,Math.min(1,-pv2*scale+0.5));
        const fxr=fu*(FW-1),fyr=fv*(FH-1);
        const x0=Math.floor(fxr),y0=Math.floor(fyr);
        const x1=Math.min(x0+1,FW-1),y1=Math.min(y0+1,FH-1);
        const wx=fxr-x0,wy=fyr-y0;
        for(let ch=0;ch<3;ch++){
          const v00=fd[(y0*FW+x0)*4+ch],v10=fd[(y0*FW+x1)*4+ch];
          const v01=fd[(y1*FW+x0)*4+ch],v11=fd[(y1*FW+x1)*4+ch];
          p[pidx+ch]=Math.round(v00*(1-wx)*(1-wy)+v10*wx*(1-wy)+v01*(1-wx)*wy+v11*wx*wy);
        }
        p[pidx+3]=255;
      } else {
        p[pidx]=team.c1[0];p[pidx+1]=team.c1[1];p[pidx+2]=team.c1[2];p[pidx+3]=255;
      }
    }
  }
  ctx.putImageData(imgd,0,0);return c;
}

(async()=>{
  const allCodes=[...new Set(TEAMS.map(t=>t.fc))];
  const flagImgs={};let loaded=0;
  const setProg=pct=>{document.getElementById('load-fill').style.width=pct+'%';};
  await Promise.all(allCodes.map(fc=>new Promise(res=>{
    const img=new Image();img.crossOrigin='anonymous';
    img.onload=()=>{flagImgs[fc]=img;loaded++;setProg(Math.round(loaded/allCodes.length*70));res();};
    img.onerror=()=>{loaded++;setProg(Math.round(loaded/allCodes.length*70));res();};
    img.src=FLAG_BASE+fc+'.png';
  })));
  document.getElementById('load-text').textContent='KÜRE OLUŞTURULUYOR';setProg(75);
  await new Promise(r=>setTimeout(r,20));
  const texCanvas=await buildFlagTexture(flagImgs);setProg(95);
  const flagTex=new THREE.CanvasTexture(texCanvas);
  flagTex.anisotropy=renderer.capabilities.getMaxAnisotropy();
  flagTex.needsUpdate=true;
  globe.material=new THREE.ShaderMaterial({
    vertexShader:VERT,fragmentShader:FRAG_FLAG,
    uniforms:{flagTex:{value:flagTex},sTex:{value:sTex},time:{value:0}}
  });
  setProg(100);
  await new Promise(r=>setTimeout(r,200));
  document.getElementById('loading').classList.add('fade');
  setTimeout(()=>{document.getElementById('loading').style.display='none';},600);
})();
