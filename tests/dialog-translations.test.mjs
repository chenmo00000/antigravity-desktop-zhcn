import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  createRuntimeOverlay,
  loadDomTranslations,
  translateDictionaryValue,
} from "../src/lib/translator.mjs";

test("deletion dialogs cover full sentences and independently rendered fragments", async () => {
  const dictionary = await loadDomTranslations();
  assert.equal(translateDictionaryValue("Delete Conversation", dictionary), "删除对话");
  assert.equal(
    translateDictionaryValue("Are you sure you want to delete this conversation? This action cannot be undone.", dictionary),
    "确定要删除此对话吗？此操作无法撤销。",
  );
  const taskName = "Daily review";
  const fragments = ["Are you sure you want to delete ", taskName, "? This action cannot be undone."];
  assert.equal(fragments.map((value) => translateDictionaryValue(value, dictionary) ?? value).join(""),
    "确定要删除 Daily review吗？此操作无法撤销。");
  assert.equal(translateDictionaryValue("project", dictionary), null);
  assert.equal(translateDictionaryValue("workspace", dictionary), null);
});

test("dialog patterns preserve names, numbers, and error details", async () => {
  const dictionary = await loadDomTranslations();
  for (const [source, expected] of [
    ['Move this conversation to "feature/$1"?', "将此对话移到“feature/$1”吗？"],
    ['Install folder "custom plugin" is already in use', "安装文件夹“custom plugin”已被占用"],
    ["Stop 1 item?", "停止这 1 项任务吗？"],
    ["Stop 12 items?", "停止这 12 项任务吗？"],
    ["This deletes 1 call recording (0.1 MB) from your machine. You can't undo this.", "这会从本机删除 1 段通话录音（0.1 MB）。此操作无法撤销。"],
    ["This deletes 12 call recordings (22.5 MB) from your machine. You can't undo this.", "这会从本机删除 12 段通话录音（22.5 MB）。此操作无法撤销。"],
    ["All 3 will be revoked. The plugin will ask before doing this again.", "将撤销全部 3 项授权。插件下次执行此操作前会重新询问。"],
    ["There was an error determining the code changes that this undo action will make: EACCES\nC:/work", "无法确定此次撤销会修改哪些代码：EACCES\nC:/work"],
  ]) assert.equal(translateDictionaryValue(source, dictionary), expected);
  assert.equal(translateDictionaryValue("Stop items?", dictionary), null);
  assert.equal(translateDictionaryValue('Move this conversation to "draft"? extra', dictionary), null);
});

test("native dialogs translate display text while preserving cancellation, arguments and unknown messages", async () => {
  const dictionary = await loadDomTranslations();
  const calls = [];
  const browserWindow = {
    confirm(...args) { calls.push({ receiver: this, method: "confirm", args }); return false; },
    alert(...args) { calls.push({ receiver: this, method: "alert", args }); },
  };
  runInNewContext(createRuntimeOverlay(dictionary), {
    window: browserWindow,
    document: { readyState: "loading", addEventListener() {} },
  });
  assert.equal(browserWindow.confirm('Are you sure you want to delete the hook "my-$1-hook"?'), false);
  assert.equal(calls.at(-1).args[0], "确定要删除钩子“my-$1-hook”吗？");
  assert.equal(calls.at(-1).receiver, browserWindow);
  assert.equal(browserWindow.confirm("Sign out of this server?"), false);
  assert.equal(calls.at(-1).args[0], "确定要退出此服务器的登录吗？");
  assert.equal(browserWindow.alert("Hook with this name already exists"), undefined);
  assert.equal(calls.at(-1).args[0], "已存在同名钩子");
  const detail = { keep: true };
  browserWindow.confirm("Custom user message", detail);
  assert.equal(calls.at(-1).args[0], "Custom user message");
  assert.equal(calls.at(-1).args[1], detail);
  browserWindow.confirm("toString");
  assert.equal(calls.at(-1).args[0], "toString");
  browserWindow.confirm();
  assert.equal(calls.at(-1).args.length, 0);
  // Native-only prompts must not become replacements in arbitrary DOM content.
  assert.equal(translateDictionaryValue("Sign out of this server?", dictionary), null);
});
