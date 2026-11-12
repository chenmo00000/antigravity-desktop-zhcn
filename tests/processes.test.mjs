import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAntigravityProcesses,
  listAntigravityProcesses,
  waitForAntigravityExit,
} from "../src/lib/processes.mjs";

test("closed windows with live sidecars still block installation", async () => {
  const processes = await listAntigravityProcesses({
    platform: "win32",
    run: async () => ({ stdout: JSON.stringify([
      {
        ProcessId: 11844,
        ExecutablePath: "C:\\Programs\\antigravity\\Antigravity.exe",
        CommandLine: '"Antigravity.exe" --import=file:///C:/user/sidecar_sdk/register_loader.js main.mjs --token=private',
      },
      { ProcessId: 10008, ExecutablePath: null, CommandLine: null },
    ]) }),
  });
  assert.equal(processes.length, 2);
  assert.equal(processes[0].isSidecar, true);
  const report = formatAntigravityProcesses(processes);
  assert.match(report, /PID 11844.*sidecar/);
  assert.match(report, /C:\\Programs\\antigravity\\Antigravity.exe/);
  assert.match(report, /PID 10008/);
  assert.doesNotMatch(report, /private|--token/);
  await assert.rejects(
    waitForAntigravityExit({ timeoutMs: 0, listProcesses: async () => processes }),
    (error) => {
      assert.match(error.message, /退出超时，未修改任何安装文件/);
      assert.match(error.message, /11844/);
      assert.match(error.message, /10008/);
      assert.match(error.message, /任务管理器/);
      return true;
    },
  );
});

test("CIM can report no running processes", async () => {
  assert.deepEqual(await listAntigravityProcesses({
    platform: "win32",
    run: async () => ({ stdout: "\uFEFF[]\r\n" }),
  }), []);
});

test("restricted CIM falls back to tasklist without dropping remaining PIDs", async () => {
  const calls = [];
  const processes = await listAntigravityProcesses({
    platform: "win32",
    run: async (file) => {
      calls.push(file);
      if (file === "powershell.exe") throw new Error("CIM unavailable");
      return { stdout: '"Antigravity.exe","42","Console","1","1,234 K"\r\n"antigravity.exe","43","Console","1","1,234 K"\r\n' };
    },
  });
  assert.deepEqual(calls, ["powershell.exe", "tasklist.exe"]);
  assert.deepEqual(processes.map((entry) => entry.pid), [42, 43]);
});

test("failed process queries stop the operation instead of implying exit", async () => {
  await assert.rejects(listAntigravityProcesses({
    platform: "win32",
    run: async () => { throw new Error("query failed"); },
  }), /无法检查 Antigravity 进程/);
  await assert.rejects(waitForAntigravityExit({
    listProcesses: async () => { throw new Error("query failed"); },
  }), /query failed/);
});

test("invalid CIM output falls back to tasklist", async () => {
  assert.deepEqual(await listAntigravityProcesses({
    platform: "win32",
    run: async (file) => ({ stdout: file === "powershell.exe"
      ? '[{"ProcessId":null}]'
      : '"Antigravity.exe","42","Console","1","1,234 K"' }),
  }), [{ pid: 42, executablePath: "", isSidecar: false }]);
});

test("waiting completes only after every process has exited", async () => {
  const snapshots = [
    [{ pid: 1 }, { pid: 2 }],
    [{ pid: 2 }],
    [],
  ];
  await waitForAntigravityExit({
    pollIntervalMs: 0,
    listProcesses: async () => snapshots.shift(),
  });
  assert.equal(snapshots.length, 0);
});

test("other platforms do not run Windows queries", async () => {
  assert.deepEqual(await listAntigravityProcesses({
    platform: "linux",
    run: async () => { assert.fail("unexpected Windows query"); },
  }), []);
});
