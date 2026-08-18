"use strict";

const extensionAPI = globalThis.browser ?? globalThis.chrome;
const elements = {
  domain: document.querySelector("#domain"),
  protection: document.querySelector("#protection"),
  darkMode: document.querySelector("#dark-mode"),
  cleanURLs: document.querySelector("#clean-urls"),
  blockElement: document.querySelector("#block-element"),
  reload: document.querySelector("#reload"),
  status: document.querySelector("#status")
};
let activeTab = null;
let activeDomain = null;

function setEnabled(enabled) {
  elements.protection.disabled = !enabled;
  elements.darkMode.disabled = !enabled;
  elements.cleanURLs.disabled = !enabled;
  elements.blockElement.disabled = !enabled;
  elements.reload.disabled = !enabled;
}

function showStatus(text) {
  elements.status.textContent = text;
}

function render(settings) {
  elements.protection.checked = settings.protection !== "disabled" && settings.protection !== "compatibility";
  elements.darkMode.value = ["alwaysOn", "alwaysOff"].includes(settings.darkMode) ? settings.darkMode : "automatic";
  elements.cleanURLs.checked = settings.cleanURLs === true;
  setEnabled(true);
}

async function send(message) {
  const response = await extensionAPI.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "PRISM could not apply the change.");
  return response;
}

async function saveSiteSetting(key, value) {
  setEnabled(false);
  showStatus("Saving locally…");
  try {
    const response = await send({ type: "setSiteSetting", domain: activeDomain, key, value });
    render(response.settings);
    try {
      await extensionAPI.tabs.sendMessage(activeTab.id, { type: "applySettings", settings: response.settings });
    } catch {
      // A restricted page may not host a content script; the saved setting still applies later.
    }
    showStatus("Saved. Reload for network-rule changes.");
  } catch (error) {
    setEnabled(true);
    showStatus(String(error?.message ?? error));
  }
}

elements.protection.addEventListener("change", async () => {
  if (!elements.protection.checked) {
    await saveSiteSetting("protection", "disabled");
    return;
  }
  setEnabled(false);
  showStatus("Saving locally…");
  try {
    await send({ type: "setSiteSetting", domain: activeDomain, key: "compatibilityMode", value: false });
    const response = await send({ type: "setSiteSetting", domain: activeDomain, key: "protection", value: "inherit" });
    render(response.settings);
    showStatus("Saved. Reload for network-rule changes.");
  } catch (error) {
    setEnabled(true);
    showStatus(String(error?.message ?? error));
  }
});
elements.darkMode.addEventListener("change", () => saveSiteSetting("darkMode", elements.darkMode.value));
elements.cleanURLs.addEventListener("change", () => saveSiteSetting("cleanURLs", elements.cleanURLs.checked));
elements.blockElement.addEventListener("click", async () => {
  if (!activeTab?.id) return;
  try {
    const response = await extensionAPI.tabs.sendMessage(activeTab.id, { type: "startElementPicker" });
    if (!response?.ok) throw new Error("Element picker is unavailable on this page.");
    globalThis.close();
  } catch (error) {
    showStatus(String(error?.message ?? error));
  }
});
elements.reload.addEventListener("click", async () => {
  if (!activeTab?.id) return;
  await extensionAPI.tabs.reload(activeTab.id);
  globalThis.close();
});

async function initialize() {
  try {
    const tabs = await extensionAPI.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];
    if (!activeTab?.url) throw new Error("Safari did not expose the active page.");
    const url = new URL(activeTab.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("PRISM does not run on this Safari page.");
    activeDomain = url.hostname.toLowerCase();
    elements.domain.textContent = activeDomain;
    const response = await send({ type: "getEffectiveSettings", domain: activeDomain });
    render(response.settings);
    showStatus("Settings are stored only on this device.");
  } catch (error) {
    setEnabled(false);
    elements.domain.textContent = "Unavailable on this page";
    showStatus(String(error?.message ?? error));
  }
}

initialize();
