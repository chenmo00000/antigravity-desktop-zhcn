import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function launchAntigravity(executablePath) {
  if (process.platform !== "win32") {
    throw new Error("自动启动 Antigravity 仅支持 Windows。");
  }

  await new Promise((resolve, reject) => {
    const child = spawn(executablePath, [], {
      cwd: path.dirname(executablePath),
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export async function listAntigravityProcesses({
  platform = process.platform,
  run = execFileAsync,
} = {}) {
  if (platform !== "win32") {
    return [];
  }

  try {
    const { stdout } = await run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", [
        "$ErrorActionPreference = 'Stop'",
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
        "ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter \"Name = 'Antigravity.exe'\" | Select-Object ProcessId, ExecutablePath, CommandLine)",
      ].join("; ")],
      { windowsHide: true, encoding: "utf8", timeout: 10_000 },
    );
    const processes = JSON.parse(stdout.replace(/^\uFEFF/, "").trim());
    if (!Array.isArray(processes) || processes.some(
      (entry) => !Number.isSafeInteger(entry?.ProcessId) || entry.ProcessId <= 0,
    )) {
      throw new Error("进程列表格式无效。");
    }
    return processes.map((entry) => ({
      pid: entry.ProcessId,
      executablePath: entry.ExecutablePath ?? "",
      // Only retain the role, never print arbitrary command-line arguments.
      isSidecar: /sidecar_sdk[\\/]register_loader\.js/i.test(entry.CommandLine ?? ""),
    }));
  } catch {
    // Some Windows installations restrict CIM. Still require all matching PIDs to exit.
  }

  try {
    const { stdout } = await run(
      "tasklist.exe",
      ["/FI", "IMAGENAME eq Antigravity.exe", "/FO", "CSV", "/NH"],
      { windowsHide: true, encoding: "utf8", timeout: 10_000 },
    );
    const processes = [...stdout.matchAll(/^"Antigravity\.exe","(\d+)"/gim)]
      .map((match) => ({ pid: Number(match[1]), executablePath: "", isSidecar: false }));
    if (/"Antigravity\.exe"/i.test(stdout) && processes.length === 0) {
      throw new Error("进程列表格式无效。");
    }
    return processes;
  } catch (cause) {
    throw new Error("无法检查 Antigravity 进程，已停止操作；请确认系统允许查询进程后重试。", { cause });
  }
}

export function formatAntigravityProcesses(processes) {
  return processes.map((entry) => [
    `- PID ${entry.pid}: Antigravity.exe${entry.isSidecar ? "（sidecar 后台服务，关闭主窗口后仍可能运行）" : ""}`,
    entry.executablePath ? `  路径: ${entry.executablePath}` : "",
  ].filter(Boolean).join("\n")).join("\n");
}

export async function isAntigravityRunning() {
  return (await listAntigravityProcesses()).length > 0;
}

export async function waitForAntigravityExit({
  timeoutMs = 180_000,
  pollIntervalMs = 1_000,
  listProcesses = listAntigravityProcesses,
} = {}) {
  const startedAt = Date.now();
  for (;;) {
    const processes = await listProcesses();
    if (processes.length === 0) return;
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error([
        "等待 Antigravity 退出超时，未修改任何安装文件。",
        "仍在运行的进程:",
        formatAntigravityProcesses(processes),
        "请保存工作，在任务管理器的“详细信息”中核对以上 PID 并结束对应进程，然后重新运行本工具。",
      ].join("\n"));
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
