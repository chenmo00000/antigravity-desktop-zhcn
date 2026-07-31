import assert from "node:assert/strict";
import test from "node:test";
import {
  countBundleDictionaryHits,
  createLocalizedBundle,
  createRuntimeOverlay,
} from "../src/lib/translator.mjs";

const dictionary = {
  schemaVersion: 1,
  exact: {
    Settings: "设置",
    "New Conversation": "新建对话",
  },
};

test("runtime overlay keeps the original bundle unchanged", () => {
  const source = Buffer.from(
    `const state = "Settings"; console.log("New Conversation");`,
    "utf8",
  );
  const localized = createLocalizedBundle(source, dictionary);
  const output = localized.buffer.toString("utf8");

  assert.ok(output.startsWith(source.toString("utf8")));
  assert.match(output, /const state = "Settings"/);
  assert.match(output, /exactTranslations/);
  assert.equal(localized.coverage.hits, 2);
});

test("runtime overlay excludes editors and code-like regions", () => {
  const overlay = createRuntimeOverlay(dictionary);
  assert.match(overlay, /contenteditable/);
  assert.match(overlay, /monaco-editor/);
  assert.match(overlay, /Node\.TEXT_NODE/);
});

test("dictionary hit count is deterministic", () => {
  assert.deepEqual(
    countBundleDictionaryHits("Settings only", dictionary),
    { hits: 1, total: 2 },
  );
});
