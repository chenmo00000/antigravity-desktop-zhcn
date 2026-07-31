import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { inspectInstallation } from "../src/lib/installation.mjs";
import { buildPatchedAsar } from "../src/lib/patcher.mjs";
import { readAsarHeader } from "../src/lib/asar-reader.mjs";
import { projectRoot } from "../src/lib/paths.mjs";

function flattenHeader(header) {
  const entries = new Map();

  function walk(directory, parentPath = "") {
    for (const [name, entry] of Object.entries(directory.files ?? {})) {
      const archivePath = parentPath ? `${parentPath}/${name}` : name;
      if (entry.files) {
        entries.set(archivePath, {
          type: "directory",
          unpacked: Boolean(entry.unpacked),
        });
        walk(entry, archivePath);
      } else if (entry.link) {
        entries.set(archivePath, {
          type: "link",
          unpacked: Boolean(entry.unpacked),
          link: entry.link,
        });
      } else {
        entries.set(archivePath, {
          type: "file",
          size: Number(entry.size),
          unpacked: Boolean(entry.unpacked),
          executable: Boolean(entry.executable),
          integrity: entry.integrity ?? null,
        });
      }
    }
  }

  walk(header);
  return entries;
}

function summarize(entries) {
  const summary = {
    files: 0,
    directories: 0,
    links: 0,
    unpackedFiles: 0,
  };
  for (const entry of entries.values()) {
    if (entry.type === "file") {
      summary.files += 1;
      if (entry.unpacked) summary.unpackedFiles += 1;
    } else if (entry.type === "directory") {
      summary.directories += 1;
    } else {
      summary.links += 1;
    }
  }
  return summary;
}

const inspection = await inspectInstallation();
if (!inspection.target) {
  throw new Error("本机安装未通过兼容性白名单，不能构建验证副本。");
}

const outputDirectory = path.join(
  projectRoot,
  ".runtime",
  "validation",
  inspection.packageVersion,
);
const outputAsarPath = path.join(outputDirectory, "app.asar");
await mkdir(outputDirectory, { recursive: true });
await rm(outputAsarPath, { force: true });
await rm(`${outputAsarPath}.unpacked`, { recursive: true, force: true });

const built = await buildPatchedAsar({
  sourceAsarPath: inspection.appAsarPath,
  outputAsarPath,
  customSchemePath: inspection.target.customSchemePath,
  expectedCustomSchemeSha256: inspection.target.customSchemeSha256,
});

const originalEntries = flattenHeader(
  (await readAsarHeader(inspection.appAsarPath)).header,
);
const patchedEntries = flattenHeader((await readAsarHeader(outputAsarPath)).header);

if (originalEntries.size !== patchedEntries.size) {
  throw new Error(
    `ASAR 条目数变化：${originalEntries.size} -> ${patchedEntries.size}`,
  );
}

for (const [archivePath, original] of originalEntries) {
  const patched = patchedEntries.get(archivePath);
  if (!patched) {
    throw new Error(`新 ASAR 缺少条目：${archivePath}`);
  }
  if (archivePath === inspection.target.customSchemePath) {
    if (
      original.type !== patched.type ||
      original.unpacked !== patched.unpacked ||
      patched.size <= original.size
    ) {
      throw new Error("customScheme.js 元数据变化异常。");
    }
    continue;
  }
  if (JSON.stringify(original) !== JSON.stringify(patched)) {
    throw new Error(`ASAR 元数据意外变化：${archivePath}`);
  }
}

console.log(`原 ASAR: ${JSON.stringify(summarize(originalEntries))}`);
console.log(`新 ASAR: ${JSON.stringify(summarize(patchedEntries))}`);
console.log(`新 ASAR 大小: ${(await stat(outputAsarPath)).size} bytes`);
console.log(`新 ASAR SHA256: ${built.patchedAsarSha256}`);
console.log(`新 customScheme SHA256: ${built.patchedCustomSchemeSha256}`);
console.log(`验证副本: ${outputAsarPath}`);
console.log("本机 ASAR 副本构建与元数据验证通过，未修改安装目录。");
