import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./paths.mjs";
import { sha256Buffer } from "./hash.mjs";

export async function loadDomTranslations() {
  const filePath = path.join(projectRoot, "config", "dom-translations.json");
  const data = JSON.parse(await readFile(filePath, "utf8"));
  if (data.schemaVersion !== 1 || !data.exact || typeof data.exact !== "object") {
    throw new Error("DOM 翻译词典格式无效。");
  }
  return data;
}

export function countBundleDictionaryHits(bundleText, dictionary) {
  let hits = 0;
  for (const source of Object.keys(dictionary.exact)) {
    if (bundleText.includes(source)) {
      hits += 1;
    }
  }
  return {
    hits,
    total: Object.keys(dictionary.exact).length,
  };
}

export function createRuntimeOverlay(dictionary) {
  const serialized = JSON.stringify(dictionary.exact);
  return `
;(() => {
  "use strict";
  const exactTranslations = new Map(Object.entries(${serialized}));
  const blockedSelector = [
    "script",
    "style",
    "code",
    "pre",
    "textarea",
    "input",
    "[contenteditable='true']",
    "[data-lexical-editor='true']",
    ".monaco-editor"
  ].join(",");
  const translatedAttributes = ["aria-label", "title", "placeholder"];
  const pendingRoots = new Set();
  let scheduled = false;
  const stats = {
    dictionarySize: exactTranslations.size,
    translatedTextNodes: 0,
    translatedAttributes: 0
  };

  function isBlocked(element) {
    return Boolean(element?.closest?.(blockedSelector));
  }

  function translateValue(value) {
    if (typeof value !== "string" || value.length === 0) return null;
    const leading = value.match(/^\\s*/u)?.[0] ?? "";
    const trailing = value.match(/\\s*$/u)?.[0] ?? "";
    const coreEnd = value.length - trailing.length;
    const core = value.slice(leading.length, coreEnd);
    const translated = exactTranslations.get(core);
    return translated ? leading + translated + trailing : null;
  }

  function translateTextNode(node) {
    const parent = node.parentElement;
    if (!parent || isBlocked(parent)) return;
    const translated = translateValue(node.nodeValue);
    if (translated !== null && translated !== node.nodeValue) {
      node.nodeValue = translated;
      stats.translatedTextNodes += 1;
    }
  }

  function translateElementAttributes(element) {
    if (isBlocked(element)) return;
    for (const attribute of translatedAttributes) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute);
      const translated = translateValue(current);
      if (translated !== null && translated !== current) {
        element.setAttribute(attribute, translated);
        stats.translatedAttributes += 1;
      }
    }
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) {
      return;
    }
    if (root.nodeType === Node.ELEMENT_NODE) {
      translateElementAttributes(root);
    }
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
    );
    let current;
    while ((current = walker.nextNode())) {
      if (current.nodeType === Node.TEXT_NODE) {
        translateTextNode(current);
      } else {
        translateElementAttributes(current);
      }
    }
  }

  function flush() {
    scheduled = false;
    const roots = [...pendingRoots];
    pendingRoots.clear();
    for (const root of roots) translateTree(root);
  }

  function enqueue(root) {
    pendingRoots.add(root);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  }

  function start() {
    document.documentElement.lang = "zh-CN";
    translateTree(document.documentElement);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          enqueue(mutation.target);
        } else if (mutation.type === "attributes") {
          enqueue(mutation.target);
        } else {
          for (const node of mutation.addedNodes) enqueue(node);
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatedAttributes
    });
    globalThis.__AGY_ZHCN__ = Object.freeze({
      version: "0.1.0",
      strategy: "dom-overlay",
      stats
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
`;
}

export function createLocalizedBundle(sourceBuffer, dictionary) {
  const sourceText = sourceBuffer.toString("utf8");
  const overlay = createRuntimeOverlay(dictionary);
  const localized = Buffer.from(`${sourceText}\n${overlay}`, "utf8");
  return {
    buffer: localized,
    sha256: sha256Buffer(localized),
    coverage: countBundleDictionaryHits(sourceText, dictionary),
  };
}

export async function writeLocalizedBundle(outputPath, localizedBuffer) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, localizedBuffer, { flag: "w" });
}
