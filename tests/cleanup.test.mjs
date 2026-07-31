import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  formatBytes,
  inspectCleanupTargets,
  inspectPurgeTargets,
  removeCleanupTargets,
} from "../src/lib/cleanup.mjs";

test("cleanup removes only reproducible files and preserves backups", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agy-cleanup-test-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  const previewRoot = path.join(workspaceRoot, ".runtime", "previews");
  const stateRoot = path.join(tempRoot, "state");
  const temporaryRoot = path.join(tempRoot, "temp");
  const backupPath = path.join(stateRoot, "backups", "2.4.3", "app.asar");

  try {
    await Promise.all([
      mkdir(previewRoot, { recursive: true }),
      mkdir(path.join(stateRoot, "cache"), { recursive: true }),
      mkdir(path.join(stateRoot, "prepared"), { recursive: true }),
      mkdir(path.dirname(backupPath), { recursive: true }),
      mkdir(path.join(temporaryRoot, "antigravity-zhcn-build-stale"), {
        recursive: true,
      }),
    ]);
    await Promise.all([
      writeFile(path.join(previewRoot, "preview.js"), "preview"),
      writeFile(path.join(stateRoot, "cache", "main.js"), "cache"),
      writeFile(path.join(stateRoot, "prepared", "main.js"), "prepared"),
      writeFile(backupPath, "backup"),
      writeFile(
        path.join(
          temporaryRoot,
          "antigravity-zhcn-build-stale",
          "app.asar",
        ),
        "temporary",
      ),
    ]);

    const targets = await inspectCleanupTargets({
      previewRoot,
      stateRoot,
      temporaryRoot,
      workspaceRoot,
    });
    assert.equal(targets.length, 4);
    assert.ok(targets.every((target) => target.bytes > 0));

    const result = await removeCleanupTargets(targets);
    assert.equal(result.removedCount, 4);
    await access(backupPath);
    await assert.rejects(() => access(previewRoot), /ENOENT/);
    await assert.rejects(() => access(path.join(stateRoot, "cache")), /ENOENT/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("cleanup size formatting is readable", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(2 * 1024 ** 2), "2.0 MB");
});

test("complete purge includes tool state but preserves unknown sibling files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agy-purge-test-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  const previewRoot = path.join(workspaceRoot, ".runtime", "previews");
  const stateRoot = path.join(tempRoot, "state");
  const temporaryRoot = path.join(tempRoot, "temp");
  const unrelatedPath = path.join(stateRoot, "keep-me.txt");

  try {
    await Promise.all([
      mkdir(path.join(stateRoot, "backups", "2.4.3"), { recursive: true }),
      mkdir(path.join(stateRoot, "logs"), { recursive: true }),
      mkdir(temporaryRoot, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(stateRoot, "backups", "2.4.3", "app.asar"), "backup"),
      writeFile(path.join(stateRoot, "logs", "cli-errors.log"), "log"),
      writeFile(path.join(stateRoot, "install-state.json"), "{}"),
      writeFile(unrelatedPath, "unrelated"),
    ]);

    const targets = await inspectPurgeTargets({
      previewRoot,
      stateRoot,
      temporaryRoot,
      workspaceRoot,
    });
    assert.deepEqual(
      targets.map((target) => target.label).sort(),
      ["原版恢复备份", "安装与恢复状态", "工具错误日志"].sort(),
    );

    await removeCleanupTargets(targets);
    await access(unrelatedPath);
    await assert.rejects(
      () => access(path.join(stateRoot, "install-state.json")),
      /ENOENT/,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
