import OBR,{buildEffect} from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
const CHANNEL="cinematic-location-titles/v3",MODAL_ID="cinematic-location-titles/v3-overlay",THEMES=new Set(["morkborg","lancer","dnd","warhammer"]);let activeEffectId=null,activeTimer=null,generation=0;
const MORK_SHADER=`
uniform shader scene;
uniform mat3 view;
uniform vec2 size;
half4 main(float2 coord){
 vec2 uv=(vec3(coord,1.0)*view).xy;half4 c=scene.eval(uv);float3 rgb=c.rgb;
 float lum=dot(rgb,float3(0.2126,0.7152,0.0722));
 float mono=clamp((lum-0.5)*2.05+0.5,0.0,1.0);mono=smoothstep(0.08,0.92,mono);
 float3 bw=float3(mono);
 float redMask=smoothstep(0.07,0.28,rgb.r-max(rgb.g,rgb.b)*1.12)*smoothstep(0.17,0.50,rgb.r);
 float yellowStrength=min(rgb.r,rgb.g)-rgb.b*1.28;
 float yellowMask=smoothstep(0.05,0.25,yellowStrength)*smoothstep(0.18,0.50,min(rgb.r,rgb.g));
 float3 crimson=float3(max(rgb.r*1.15,0.22),rgb.g*0.24,rgb.b*0.21);
 float3 toxic=float3(max(rgb.r,0.50),max(rgb.g,0.50),rgb.b*0.16);
 float3 outColor=mix(bw,crimson,redMask*.96);outColor=mix(outColor,toxic,yellowMask*(1.0-redMask)*.92);
 vec2 p=uv/size;vec2 centered=p*2.0-1.0;centered.x*=size.x/max(size.y,1.0);float vignette=smoothstep(.35,1.25,length(centered));outColor*=mix(.98,.46,vignette);
 return half4(outColor,c.a);
}`;
const safeTheme=v=>THEMES.has(v)?v:"morkborg";
function overlayUrl(p){const q=new URLSearchParams({title:p.title??"",subtitle:p.subtitle??"",duration:String(p.duration??5000),darkness:String(p.darkness??.62),theme:safeTheme(p.theme),v:"3.2"});return`/overlay.html?${q}`}
async function removeEffect(){if(!activeEffectId)return;try{await OBR.scene.local.deleteItems([activeEffectId])}catch(e){console.warn("Could not remove post-process effect",e)}activeEffectId=null}
async function closeOverlay(){try{await OBR.modal.close(MODAL_ID)}catch{}}
async function clearVisuals(){if(activeTimer){clearTimeout(activeTimer);activeTimer=null}await Promise.allSettled([removeEffect(),closeOverlay()])}
async function addMorkEffect(){try{if(!(await OBR.scene.isReady()))return;const effect=buildEffect().effectType("VIEWPORT").sksl(MORK_SHADER).locked(true).disableHit(true).layer("POST_PROCESS").name("Cinematic MORK BORG").build();await OBR.scene.local.addItems([effect]);activeEffectId=effect.id}catch(e){console.warn("Post-process unavailable; overlay-only fallback",e);activeEffectId=null}}
async function show(payload){const my=++generation;await clearVisuals();if(my!==generation)return;const theme=safeTheme(payload.theme);if(theme==="morkborg")await addMorkEffect();try{await OBR.modal.open({id:MODAL_ID,url:overlayUrl({...payload,theme}),fullScreen:true,hideBackdrop:true,hidePaper:true,disablePointerEvents:true})}catch(e){console.error("Could not open overlay",e)}const duration=Math.max(2200,Math.min(15000,Number(payload.duration)||5000));activeTimer=setTimeout(async()=>{if(my!==generation)return;await clearVisuals()},duration+650)}
OBR.onReady(()=>{OBR.broadcast.onMessage(CHANNEL,async event=>{const p=event.data;if(!p||typeof p!=="object")return;if(p.type==="SHOW")await show(p);else if(p.type==="HIDE"){generation++;await clearVisuals()}})});
