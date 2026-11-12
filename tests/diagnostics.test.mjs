import assert from "node:assert/strict";
import test from "node:test";
import { getErrorAdvice } from "../src/lib/diagnostics.mjs";

test("diagnostics explains runtime UI failures", () => {
  assert.match(
    getErrorAdvice(new Error("没有找到运行中的 Antigravity UI 端口")),
    /打开 Antigravity/,
  );
});

test("diagnostics explains unsupported versions", () => {
  const advice = getErrorAdvice(
    new Error("当前安装文件不在兼容性白名单中"),
  );
  assert.match(advice, /不能安全安装/);
  assert.match(advice, /releases\/latest/);
});

test("diagnostics keeps a safe fallback", () => {
  assert.match(getErrorAdvice(new Error("unexpected")), /不要手动修改 app\.asar/);
});

test("diagnostics explains lingering sidecar processes after the window closes", () => {
  const advice = getErrorAdvice(new Error("等待 Antigravity 退出超时，未修改任何安装文件。"));
  assert.match(advice, /任务管理器/);
  assert.match(advice, /PID/);
  assert.match(advice, /sidecar/);
  assert.match(advice, /重新运行/);
});

test("diagnostics explains process query failures", () => {
  assert.match(getErrorAdvice(new Error("无法检查 Antigravity 进程")), /tasklist/);
});

test("diagnostics refuses to purge a modified localized bundle", () => {
  assert.match(
    getErrorAdvice(new Error("本地中文 UI 文件已被修改，无法安全删除")),
    /保留了备份和状态/,
  );
});
