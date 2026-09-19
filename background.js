import OBR, { buildEffect } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const CHANNEL = "cinematic-location-titles/v1";
const MODAL_ID = "cinematic-location-titles/overlay";
let activeEffectId = null;
let activeTimer = null;
let generation = 0;

const POST_SHADER = `
uniform shader scene;
uniform mat3 view;
uniform vec2 size;

half4 main(float2 coord) {
  vec2 uv = (vec3(coord, 1.0) * view).xy;
  half4 c = scene.eval(uv);

  float3 rgb = c.rgb;
  float lum = dot(rgb, float3(0.2126, 0.7152, 0.0722));

  // Hard monochrome base.
  float mono = clamp((lum - 0.5) * 1.75 + 0.5, 0.0, 1.0);
  float3 bw = float3(mono);

  // Preserve / exaggerate deep crimson and dirty toxic yellow.
  float redMask = smoothstep(0.06, 0.32, rgb.r - max(rgb.g, rgb.b) * 1.12);
  redMask *= smoothstep(0.18, 0.52, rgb.r);

  float yellowStrength = min(rgb.r, rgb.g) - rgb.b * 1.25;
  float yellowMask = smoothstep(0.05, 0.28, yellowStrength);
  yellowMask *= smoothstep(0.16, 0.52, min(rgb.r, rgb.g));

  float3 crimson = float3(
    max(rgb.r * 1.10, 0.20),
    rgb.g * 0.34,
    rgb.b * 0.30
  );

  float3 toxic = float3(
    max(rgb.r, 0.42),
    max(rgb.g, 0.44),
    rgb.b * 0.26
  );

  float3 outColor = mix(bw, crimson, redMask * 0.92);
  outColor = mix(outColor, toxic, yellowMask * (1.0 - redMask) * 0.82);

  // Filmic crushing and edge vignette.
  vec2 screenP = uv / size;
  vec2 centered = screenP * 2.0 - 1.0;
  centered.x *= size.x / max(size.y, 1.0);
  float vignette = smoothstep(0.35, 1.25, length(centered));
  outColor *= mix(0.94, 0.48, vignette);

  return half4(outColor, c.a);
}
`;

function overlayUrl(payload) {
  const params = new URLSearchParams({
    title: payload.title ?? "",
    subtitle: payload.subtitle ?? "",
    duration: String(payload.duration ?? 5000),
    darkness: String(payload.darkness ?? 0.62),
  });
  return `/overlay.html?${params.toString()}`;
}

async function removeEffect() {
  if (!activeEffectId) return;
  try {
    await OBR.scene.local.deleteItems([activeEffectId]);
  } catch (error) {
    console.warn("Cinematic title: could not remove post-process effect", error);
  }
  activeEffectId = null;
}

async function closeOverlay() {
  try {
    await OBR.modal.close(MODAL_ID);
  } catch (_) {
    // Safe when the modal is already closed.
  }
}

async function clearVisuals() {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  await Promise.allSettled([removeEffect(), closeOverlay()]);
}

async function addSceneEffect() {
  try {
    if (!(await OBR.scene.isReady())) return;

    const effect = buildEffect()
      .effectType("VIEWPORT")
      .sksl(POST_SHADER)
      .locked(true)
      .disableHit(true)
      .layer("POST_PROCESS")
      .name("Cinematic monochrome")
      .build();

    await OBR.scene.local.addItems([effect]);
    activeEffectId = effect.id;
  } catch (error) {
    // Experimental SDK feature: overlay still works if the shader fails.
    console.warn("Cinematic title: post-process effect unavailable, using overlay-only fallback", error);
    activeEffectId = null;
  }
}

async function show(payload) {
  const myGeneration = ++generation;
  await clearVisuals();
  if (myGeneration !== generation) return;

  await addSceneEffect();

  try {
    await OBR.modal.open({
      id: MODAL_ID,
      url: overlayUrl(payload),
      fullScreen: true,
      hideBackdrop: true,
      hidePaper: true,
      disablePointerEvents: true,
    });
  } catch (error) {
    console.error("Cinematic title: could not open overlay", error);
  }

  const duration = Math.max(2200, Math.min(15000, Number(payload.duration) || 5000));
  activeTimer = setTimeout(async () => {
    if (myGeneration !== generation) return;
    await clearVisuals();
  }, duration + 450);
}

OBR.onReady(() => {
  OBR.broadcast.onMessage(CHANNEL, async (event) => {
    const payload = event.data;
    if (!payload || typeof payload !== "object") return;

    if (payload.type === "SHOW") {
      await show(payload);
    } else if (payload.type === "HIDE") {
      generation++;
      await clearVisuals();
    }
  });
});
