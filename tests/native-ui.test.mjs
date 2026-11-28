import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createNativeUiOverlay } from "../src/lib/native-ui.mjs";

function createElectronContext() {
  const calls = [];
  class Tray {
    setContextMenu(...args) { calls.push({ receiver: this, args }); return "menu-result"; }
  }
  const result = Promise.resolve({ response: 0, checkboxChecked: false });
  const dialog = {
    showMessageBox(...args) { calls.push({ receiver: this, args }); return result; },
  };
  const electron = { app: { getName: () => "Antigravity" }, Tray, dialog };
  const context = { require(name) { assert.equal(name, "electron"); return electron; } };
  runInNewContext(createNativeUiOverlay(), context);
  return { calls, Tray, dialog, context, result };
}

test("tray translation covers updates and WSL insertion without changing actions or distro names", () => {
  const { calls, Tray } = createElectronContext();
  const tray = new Tray();
  const click = () => {};
  const distro = { label: "Quit", checked: true, click };
  const count = { id: "running-agents", label: "No agents running", enabled: false };
  const menu = { items: [count, { label: "Open Antigravity", click }, { label: "Quit", click }] };
  assert.equal(tray.setContextMenu(menu), "menu-result");
  assert.deepEqual(menu.items.map(item => item.label), ["暂无智能体运行", "打开 Antigravity", "退出"]);
  assert.equal(menu.items[2].click, click);
  assert.equal(count.enabled, false);
  assert.equal(calls.at(-1).receiver, tray);
  assert.equal(calls.at(-1).args[0], menu);
  for (const [source, expected] of [
    ["1 agent running", "1 个智能体正在运行"],
    ["12 agents running", "12 个智能体正在运行"],
    ["No agents running", "暂无智能体运行"],
  ]) {
    count.label = source;
    tray.setContextMenu(menu);
    assert.equal(count.label, expected);
  }
  menu.items.splice(1, 0, { label: "Connect to WSL", submenu: { items: [distro] } }, { label: "Reopen Locally", click });
  tray.setContextMenu(menu);
  assert.equal(menu.items[1].label, "连接到 WSL");
  assert.equal(menu.items[2].label, "在本机重新打开");
  assert.equal(distro.label, "Quit");
  assert.equal(distro.checked, true);
  const unrelated = { id: "custom", label: "12 agents running" };
  tray.setContextMenu({ items: [unrelated] });
  assert.equal(unrelated.label, "12 agents running");
  tray.setContextMenu(null);
  assert.equal(calls.at(-1).args[0], null);
});

test("quit confirmation preserves button indexes, window, defaults and promise results", async () => {
  const { calls, dialog, result } = createElectronContext();
  const win = {};
  const options = {
    title: "Confirm Quit", message: "Are you sure you want to quit?",
    detail: "There may be agents or background tasks running.",
    buttons: ["Cancel", "Quit"], cancelId: 0, defaultId: 1, type: "question",
  };
  assert.equal(dialog.showMessageBox(win, options), result);
  const forwarded = calls.at(-1).args;
  assert.equal(forwarded[0], win);
  assert.equal(calls.at(-1).receiver, dialog);
  assert.equal(forwarded[1].title, "确认退出");
  assert.equal(forwarded[1].message, "确定要退出吗？");
  assert.equal(forwarded[1].detail, "可能仍有智能体或后台任务正在运行。");
  assert.deepEqual(Array.from(forwarded[1].buttons), ["取消", "退出"]);
  assert.equal(forwarded[1].cancelId, 0);
  assert.equal(forwarded[1].defaultId, 1);
  assert.equal(forwarded[1].type, "question");
  assert.equal((await result).response, 0);
  assert.equal(options.title, "Confirm Quit");
  assert.deepEqual(options.buttons, ["Cancel", "Quit"]);
  dialog.showMessageBox(options);
  assert.equal(calls.at(-1).args.length, 1);
  assert.equal(calls.at(-1).args[0].title, "确认退出");
  const unknown = { ...options, message: "Custom prompt" };
  dialog.showMessageBox(win, unknown);
  assert.equal(calls.at(-1).args[1], unknown);
});

test("native hooks are installed only once", () => {
  const { Tray, dialog, context } = createElectronContext();
  const setMenu = Tray.prototype.setContextMenu;
  const showDialog = dialog.showMessageBox;
  runInNewContext(createNativeUiOverlay(), context);
  assert.equal(Tray.prototype.setContextMenu, setMenu);
  assert.equal(dialog.showMessageBox, showDialog);
});
