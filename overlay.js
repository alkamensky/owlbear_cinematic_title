import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const MODAL_ID = "cinematic-location-titles/overlay";
const params = new URLSearchParams(window.location.search);

const title = (params.get("title") || "").trim().toLocaleUpperCase("ru-RU").slice(0, 80);
const subtitle = (params.get("subtitle") || "").trim().toLocaleUpperCase("ru-RU").slice(0, 120);
const duration = Math.max(2200, Math.min(15000, Number(params.get("duration")) || 5000));
const darkness = Math.max(0.25, Math.min(0.9, Number(params.get("darkness")) || 0.62));

const root = document.documentElement;
root.style.setProperty("--duration", `${duration}ms`);
root.style.setProperty("--darkness", String(darkness));

const titleEl = document.querySelector("#title");
const subtitleEl = document.querySelector("#subtitle");
titleEl.textContent = title;
titleEl.dataset.echo = title;
subtitleEl.textContent = subtitle;

OBR.onReady(() => {
  window.setTimeout(() => {
    OBR.modal.close(MODAL_ID).catch(() => {});
  }, duration + 150);
});
