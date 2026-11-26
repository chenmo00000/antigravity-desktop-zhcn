import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./paths.mjs";
import { sha256Buffer } from "./hash.mjs";

// Match the renderer's native menu serializer independently of minified names.
const nativeMenuLabelAnchor =
  /label:([\w$]+)\.label(?=,type:\1\.type&&\1\.type!=="item"&&\1\.type!=="label"\?\1\.type:"normal",checked:\1\.checked,disabled:\1\.type==="label"\?!0:\1\.disabled,accelerator:)/gu;

export async function loadDomTranslations() {
  const filePath = path.join(projectRoot, "config", "dom-translations.json");
  const data = JSON.parse(await readFile(filePath, "utf8"));
  if (
    data.schemaVersion !== 2 ||
    !data.exact ||
    typeof data.exact !== "object" ||
    !Array.isArray(data.patterns)
  ) {
    throw new Error("DOM 翻译词典格式无效。");
  }
  for (const pattern of data.patterns) {
    if (
      !pattern ||
      typeof pattern.source !== "string" ||
      typeof pattern.target !== "string" ||
      typeof pattern.flags !== "string"
    ) {
      throw new Error("DOM 动态翻译规则格式无效。");
    }
    try {
      new RegExp(pattern.source, pattern.flags);
    } catch {
      throw new Error(`DOM 动态翻译规则无效：${pattern.source}`);
    }
  }
  return data;
}

function compilePatternTranslations(dictionary) {
  return (dictionary.patterns ?? []).map(({ source, target, flags = "u" }) => ({
    regex: new RegExp(source, flags),
    target,
  }));
}

export function translateDictionaryValue(value, dictionary) {
  if (typeof value !== "string" || value.length === 0) return null;
  const leading = value.match(/^\s*/u)?.[0] ?? "";
  const trailing = value.match(/\s*$/u)?.[0] ?? "";
  const coreEnd = value.length - trailing.length;
  const core = value.slice(leading.length, coreEnd);
  const exact = dictionary.exact[core];
  if (exact !== undefined) return leading + exact + trailing;

  for (const { regex, target } of compilePatternTranslations(dictionary)) {
    regex.lastIndex = 0;
    if (!regex.test(core)) continue;
    regex.lastIndex = 0;
    return leading + core.replace(regex, target) + trailing;
  }
  return null;
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
  const serializedMenu = JSON.stringify(dictionary.menu ?? {});
  const serializedPatterns = JSON.stringify(dictionary.patterns ?? []);
  return `
;(() => {
  "use strict";
  const exactTranslations = new Map(Object.entries(${serialized}));
  const menuTranslations = new Map(Object.entries(${serializedMenu}));
  const patternTranslations = ${serializedPatterns}.map(({ source, target, flags }) => ({
    regex: new RegExp(source, flags),
    target
  }));
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
  const blockedAttributeSelector = [
    "script",
    "style",
    "code",
    "pre",
    ".monaco-editor"
  ].join(",");
  const translatedAttributes = ["aria-label", "title", "placeholder"];
  const menuSelector = '[role="menu"], [data-testid="rename-conversation-submit"]';
  const userNamedMenuItemSelector =
    '[role="menu"] :is([data-testid^="conversation-group-"], [data-testid^="conversation-project-"])';
  const pendingRoots = new Set();
  let scheduled = false;
  const stats = {
    dictionarySize: exactTranslations.size,
    patternCount: patternTranslations.length,
    translatedTextNodes: 0,
    translatedAttributes: 0
  };

  function isBlocked(element) {
    return Boolean(element?.closest?.(blockedSelector));
  }

  function isAttributeBlocked(element) {
    return Boolean(element?.closest?.(blockedAttributeSelector));
  }

  function translateValue(value, isMenu = false) {
    if (typeof value !== "string" || value.length === 0) return null;
    const leading = value.match(/^\\s*/u)?.[0] ?? "";
    const trailing = value.match(/\\s*$/u)?.[0] ?? "";
    const coreEnd = value.length - trailing.length;
    const core = value.slice(leading.length, coreEnd);
    const exact = (isMenu ? menuTranslations.get(core) : undefined) ?? exactTranslations.get(core);
    if (exact !== undefined) return leading + exact + trailing;
    for (const { regex, target } of patternTranslations) {
      regex.lastIndex = 0;
      if (!regex.test(core)) continue;
      regex.lastIndex = 0;
      return leading + core.replace(regex, target) + trailing;
    }
    return null;
  }

  function translateElementValue(value, element) {
    if (element.closest?.(userNamedMenuItemSelector)) return null;
    return translateValue(value, Boolean(element.closest?.(menuSelector)));
  }

  function translateNativeMenuLabel(value, testId, itemId) {
    // Project and group destinations can carry names entered by the user.
    if (/^conversation-(?:group|project)-/u.test(testId)) return value;
    if (itemId !== "sort-label" && !/^(?:group-header-|conversation-)/u.test(testId)) {
      return value;
    }
    return translateValue(value, true) ?? value;
  }

  function translateTextNode(node) {
    const parent = node.parentElement;
    if (!parent || isBlocked(parent)) return;
    if (parent.closest?.('[data-testid="delete-project-button"]')) {
      const scoped = node.nodeValue === "Delete " ? "删除" : node.nodeValue === "Project" ? "项目" : null;
      if (scoped !== null) {
        node.nodeValue = scoped;
        stats.translatedTextNodes += 1;
        return;
      }
    }
    if (parent.closest?.('[data-testid="sidecar-list-empty"]')) {
      const emptyState = {
        "No ": "暂无",
        automations: "自动化任务",
        "scheduled tasks": "计划任务",
        " yet": "",
      };
      const scoped = emptyState[node.nodeValue];
      if (scoped !== undefined && scoped !== node.nodeValue) {
        node.nodeValue = scoped;
        stats.translatedTextNodes += 1;
        return;
      }
    }
    const translated = translateElementValue(node.nodeValue, parent);
    if (translated !== null && translated !== node.nodeValue) {
      node.nodeValue = translated;
      stats.translatedTextNodes += 1;
    }
  }

  function translateElementAttributes(element) {
    if (isAttributeBlocked(element)) return;
    for (const attribute of translatedAttributes) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute);
      const translated = translateElementValue(current, element);
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
  }

  globalThis.__AGY_ZHCN__ = Object.freeze({
    version: "0.1.1",
    strategy: "dom-overlay",
    stats,
    translateNativeMenuLabel
  });

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
  const nativeMenuAnchors = [...sourceText.matchAll(nativeMenuLabelAnchor)];
  const localizedSource = nativeMenuAnchors.length === 1
    ? sourceText.replace(nativeMenuLabelAnchor, (_match, item) =>
        `label:(globalThis.__AGY_ZHCN__?.translateNativeMenuLabel?.(${item}.label,${item}.testId,${item}.id)??${item}.label)`,
      )
    : sourceText;
  const localized = Buffer.from(`${localizedSource}\n${overlay}`, "utf8");
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
