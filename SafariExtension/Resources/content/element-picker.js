(() => {
  "use strict";

  function escapeAttribute(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  }

  function isUnique(selector, documentObject) {
    try {
      return documentObject.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  function stableSelector(element, documentObject = document) {
    if (!(element instanceof Element)) return null;
    if (element.id) {
      const selector = `#${CSS.escape(element.id)}`;
      if (isUnique(selector, documentObject)) return selector;
    }

    for (const attribute of ["data-testid", "data-test", "aria-label", "name"]) {
      const value = element.getAttribute(attribute);
      if (!value || value.length > 96) continue;
      const selector = `${element.localName}[${attribute}="${escapeAttribute(value)}"]`;
      if (isUnique(selector, documentObject)) return selector;
    }

    const stableClasses = [...element.classList]
      .filter((value) => /^[a-zA-Z][a-zA-Z0-9_-]{1,48}$/.test(value) && !/\d{5,}/.test(value))
      .slice(0, 3);
    if (stableClasses.length > 0) {
      const selector = `${element.localName}${stableClasses.map((value) => `.${CSS.escape(value)}`).join("")}`;
      if (isUnique(selector, documentObject)) return selector;
    }

    const parts = [];
    let current = element;
    for (let depth = 0; current && current.nodeType === 1 && depth < 5; depth += 1) {
      let part = current.localName;
      const siblings = current.parentElement
        ? [...current.parentElement.children].filter((candidate) => candidate.localName === current.localName)
        : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      const selector = parts.join(" > ");
      if (isUnique(selector, documentObject)) return selector;
      current = current.parentElement;
    }
    return parts.length > 0 ? parts.join(" > ") : null;
  }

  class ElementPicker {
    constructor(documentObject = document) {
      this.document = documentObject;
      this.hovered = null;
      this.originalOutline = null;
      this.host = null;
      this.commit = null;
      this.onPointerMove = (event) => this.pointerMove(event);
      this.onClick = (event) => this.select(event);
      this.onKeyDown = (event) => { if (event.key === "Escape") this.stop(); };
    }

    start(commit) {
      if (this.host) return;
      this.commit = commit;
      this.createToolbar("Choose an element on this page", false);
      this.document.addEventListener("pointermove", this.onPointerMove, true);
      this.document.addEventListener("click", this.onClick, true);
      this.document.addEventListener("keydown", this.onKeyDown, true);
    }

    pointerMove(event) {
      const target = event.composedPath().find((node) => node instanceof Element && node !== this.host && !this.host?.contains(node));
      if (!target || target === this.hovered) return;
      this.clearHighlight();
      this.hovered = target;
      this.originalOutline = {
        value: target.style.getPropertyValue("outline"),
        priority: target.style.getPropertyPriority("outline")
      };
      target.style.setProperty("outline", "3px solid rgb(39 187 220)", "important");
    }

    select(event) {
      if (!this.hovered || this.host?.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.document.removeEventListener("pointermove", this.onPointerMove, true);
      this.document.removeEventListener("click", this.onClick, true);
      const selector = stableSelector(this.hovered, this.document);
      if (!selector) {
        this.createToolbar("A stable selector could not be created", false);
        return;
      }
      this.selectedSelector = selector;
      this.createToolbar(`Preview: ${selector}`, true);
    }

    createToolbar(message, canSave) {
      this.host?.remove();
      const host = this.document.createElement("div");
      host.id = "prism-element-picker";
      host.style.setProperty("all", "initial", "important");
      host.style.setProperty("position", "fixed", "important");
      host.style.setProperty("left", "50%", "important");
      host.style.setProperty("bottom", "24px", "important");
      host.style.setProperty("transform", "translateX(-50%)", "important");
      host.style.setProperty("z-index", "2147483647", "important");
      const shadow = host.attachShadow({ mode: "closed" });
      const style = this.document.createElement("style");
      style.textContent = `
        .bar { display:flex; align-items:center; gap:10px; max-width:min(640px,calc(100vw - 32px)); padding:11px 12px; border:1px solid rgb(255 255 255 / 20%); border-radius:14px; background:rgb(18 24 38 / 96%); color:white; box-shadow:0 14px 40px rgb(0 0 0 / 35%); font:13px -apple-system,system-ui,sans-serif; }
        .message { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        button { border:0; border-radius:9px; padding:7px 10px; color:white; background:rgb(255 255 255 / 12%); font:600 13px -apple-system,system-ui,sans-serif; }
        button.primary { background:rgb(32 155 202); }
        button:focus-visible { outline:3px solid rgb(98 216 239); outline-offset:2px; }
      `;
      const bar = this.document.createElement("div");
      bar.className = "bar";
      const text = this.document.createElement("span");
      text.className = "message";
      text.textContent = message;
      bar.append(text);
      if (canSave) {
        const save = this.document.createElement("button");
        save.className = "primary";
        save.type = "button";
        save.textContent = "Block";
        save.addEventListener("click", () => this.save());
        bar.append(save);
      }
      const cancel = this.document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => this.stop());
      bar.append(cancel);
      shadow.append(style, bar);
      (this.document.body ?? this.document.documentElement).append(host);
      this.host = host;
    }

    async save() {
      if (!this.selectedSelector || typeof this.commit !== "function") return;
      const selector = this.selectedSelector;
      try {
        await this.commit(selector);
        this.clearHighlight();
        this.stop(false);
      } catch {
        this.createToolbar("PRISM could not save this rule", true);
      }
    }

    clearHighlight() {
      if (!this.hovered || !this.originalOutline) return;
      if (this.originalOutline.value) {
        this.hovered.style.setProperty("outline", this.originalOutline.value, this.originalOutline.priority);
      } else {
        this.hovered.style.removeProperty("outline");
      }
      this.originalOutline = null;
    }

    stop(restoreHighlight = true) {
      this.document.removeEventListener("pointermove", this.onPointerMove, true);
      this.document.removeEventListener("click", this.onClick, true);
      this.document.removeEventListener("keydown", this.onKeyDown, true);
      if (restoreHighlight) this.clearHighlight();
      this.host?.remove();
      this.host = null;
      this.hovered = null;
      this.selectedSelector = null;
      this.commit = null;
    }
  }

  globalThis.PRISMElementPicker = Object.freeze({ ElementPicker, stableSelector });
})();
