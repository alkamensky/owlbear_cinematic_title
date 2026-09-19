import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const CHANNEL = "cinematic-location-titles/v1";

const titleEl = document.querySelector("#title");
const subtitleEl = document.querySelector("#subtitle");
const durationEl = document.querySelector("#duration");
const darknessEl = document.querySelector("#darkness");
const darknessValueEl = document.querySelector("#darknessValue");
const showBtn = document.querySelector("#show");
const hideBtn = document.querySelector("#hide");
const statusEl = document.querySelector("#status");
const roleNoticeEl = document.querySelector("#roleNotice");

let lastAutoTitle = "";

function upper(value, limit = 80) {
  return String(value ?? "")
    .trim()
    .toLocaleUpperCase("ru-RU")
    .slice(0, limit);
}

function upperWhileTyping(value, limit = 80) {
  return String(value ?? "")
    .toLocaleUpperCase("ru-RU")
    .slice(0, limit);
}

function cleanItemName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\.(png|jpe?g|webp|gif|avif|svg|mp4|webm)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metadataSceneName(metadata) {
  if (!metadata || typeof metadata !== "object") return "";

  // Owlbear does not currently expose the scene's system name through a
  // documented getName() API. These keys are only a best-effort hook for
  // rooms/extensions that already mirror the name into scene metadata.
  const directKeys = ["sceneName", "scene_name", "name"];
  for (const key of directKeys) {
    if (typeof metadata[key] === "string" && metadata[key].trim()) {
      return metadata[key].trim();
    }
  }

  return "";
}

async function detectCurrentSceneTitle() {
  if (!(await OBR.scene.isReady())) {
    return { title: "", source: "none" };
  }

  try {
    const metadata = await OBR.scene.getMetadata();
    const fromMetadata = metadataSceneName(metadata);
    if (fromMetadata) {
      return { title: upper(fromMetadata), source: "metadata" };
    }
  } catch (error) {
    console.warn("Cinematic title: scene metadata lookup failed", error);
  }

  try {
    const mapItems = await OBR.scene.items.getItems(
      (item) => item.layer === "MAP" && item.type === "IMAGE"
    );

    if (mapItems.length) {
      // Prefer the largest map image: in normal scenes this is usually the
      // base map rather than a small decoration placed on the MAP layer.
      const sorted = [...mapItems].sort((a, b) => {
        const areaA = (a.image?.width || 0) * (a.scale?.x || 1) * (a.image?.height || 0) * (a.scale?.y || 1);
        const areaB = (b.image?.width || 0) * (b.scale?.x || 1) * (b.image?.height || 0) * (b.scale?.y || 1);
        return areaB - areaA;
      });

      const fromMap = cleanItemName(sorted[0]?.name);
      if (fromMap) {
        return { title: upper(fromMap), source: "map" };
      }
    }
  } catch (error) {
    console.warn("Cinematic title: base-map name lookup failed", error);
  }

  return { title: "", source: "none" };
}

async function refreshAutoTitle({ announce = false } = {}) {
  const before = upper(titleEl.value);
  const mayReplace = !before || before === lastAutoTitle;
  if (!mayReplace) return;

  const detected = await detectCurrentSceneTitle();
  if (!detected.title) {
    if (before === lastAutoTitle) titleEl.value = "";
    lastAutoTitle = "";
    if (announce) {
      setStatus("Имя сцены не удалось получить — введите заголовок вручную.");
    }
    return;
  }

  titleEl.value = detected.title;
  lastAutoTitle = detected.title;

  if (announce) {
    if (detected.source === "metadata") {
      setStatus(`Подставлено название: «${detected.title}».`, "ok");
    } else {
      setStatus(`Подставлено имя основной карты: «${detected.title}». Его можно заменить вручную.`, "ok");
    }
  }
}

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`.trim();
}

function setControlsEnabled(enabled) {
  for (const el of [titleEl, subtitleEl, durationEl, darknessEl, showBtn, hideBtn]) {
    el.disabled = !enabled;
  }
}

titleEl.addEventListener("input", () => {
  const start = titleEl.selectionStart;
  const end = titleEl.selectionEnd;
  const transformed = upperWhileTyping(titleEl.value);
  if (titleEl.value !== transformed) {
    titleEl.value = transformed;
    try {
      titleEl.setSelectionRange(start, end);
    } catch {}
  }
});

subtitleEl.addEventListener("input", () => {
  const start = subtitleEl.selectionStart;
  const end = subtitleEl.selectionEnd;
  const transformed = upperWhileTyping(subtitleEl.value, 120);
  if (subtitleEl.value !== transformed) {
    subtitleEl.value = transformed;
    try {
      subtitleEl.setSelectionRange(start, end);
    } catch {}
  }
});

darknessEl.addEventListener("input", () => {
  darknessValueEl.value = `${Math.round(Number(darknessEl.value) * 100)}%`;
});

OBR.onReady(async () => {
  try {
    const role = await OBR.player.getRole();
    if (role !== "GM") {
      setControlsEnabled(false);
      roleNoticeEl.hidden = false;
      setStatus("Клиент слушает общие титры. Панель управления отключена.");
      return;
    }

    setControlsEnabled(true);
    setStatus("Готово. Ищу название текущей сцены…");
    await refreshAutoTitle({ announce: true });

    // Re-run auto detection when the GM changes scenes. Manual text is never
    // overwritten; only an empty field or the previous auto-filled value is.
    OBR.scene.onReadyChange(async (ready) => {
      if (!ready) return;
      await refreshAutoTitle({ announce: true });
    });

    showBtn.addEventListener("click", async () => {
      const title = upper(titleEl.value);
      const subtitle = upper(subtitleEl.value, 120);
      const duration = Math.max(2200, Math.min(15000, Number(durationEl.value) || 5000));
      const darkness = Math.max(0.25, Math.min(0.9, Number(darknessEl.value) || 0.62));

      titleEl.value = title;
      subtitleEl.value = subtitle;

      if (!title) {
        setStatus("Введите заголовок локации.", "error");
        titleEl.focus();
        return;
      }

      try {
        await OBR.broadcast.sendMessage(
          CHANNEL,
          { type: "SHOW", title, subtitle, duration, darkness, sentAt: Date.now() },
          { destination: "ALL" }
        );
        setStatus(`Показ: «${title}»`, "ok");
      } catch (error) {
        console.error(error);
        setStatus("Не удалось отправить титр. Проверьте подключение комнаты.", "error");
      }
    });

    hideBtn.addEventListener("click", async () => {
      try {
        await OBR.broadcast.sendMessage(
          CHANNEL,
          { type: "HIDE", sentAt: Date.now() },
          { destination: "ALL" }
        );
        setStatus("Заставка скрыта.", "ok");
      } catch (error) {
        console.error(error);
        setStatus("Не удалось скрыть заставку.", "error");
      }
    });
  } catch (error) {
    console.error(error);
    setControlsEnabled(false);
    setStatus("Не удалось подключиться к API Owlbear Rodeo.", "error");
  }
});
