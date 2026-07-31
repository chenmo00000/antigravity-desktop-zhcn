import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { readFileFromAsar, readJsonFromAsar } from "./asar-reader.mjs";
import { sha256Buffer, sha256File } from "./hash.mjs";
import { projectRoot, resolveInstallRoot } from "./paths.mjs";

export async function loadCompatibilityManifest() {
  const filePath = path.join(projectRoot, "config", "compatibility.json");
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.targets)) {
    throw new Error("兼容性清单格式无效。");
  }
  return manifest;
}

export async function inspectInstallation() {
  const {
    installRoot,
    source: installRootSource,
    sourceLabel: installRootSourceLabel,
  } = await resolveInstallRoot();
  const executablePath = path.join(installRoot, "Antigravity.exe");
  const appAsarPath = path.join(installRoot, "resources", "app.asar");

  await access(executablePath, constants.R_OK);
  await access(appAsarPath, constants.R_OK);

  const packageJson = await readJsonFromAsar(appAsarPath, "package.json");
  const manifest = await loadCompatibilityManifest();
  const versionTargets = manifest.targets.filter(
    (target) =>
      target.platform === process.platform &&
      target.arch === process.arch &&
      target.appVersion === packageJson.version,
  );

  const appAsarSha256 = await sha256File(appAsarPath);
  const customSchemePaths = [
    ...new Set(versionTargets.map((target) => target.customSchemePath)),
  ];
  const customSchemes = {};
  for (const customSchemePath of customSchemePaths) {
    const buffer = await readFileFromAsar(appAsarPath, customSchemePath);
    customSchemes[customSchemePath] = {
      buffer,
      sha256: sha256Buffer(buffer),
    };
  }

  const target =
    versionTargets.find(
      (candidate) =>
        candidate.appAsarSha256 === appAsarSha256 &&
        customSchemes[candidate.customSchemePath]?.sha256 ===
          candidate.customSchemeSha256,
    ) ?? null;

  return {
    installRoot,
    installRootSource,
    installRootSourceLabel,
    executablePath,
    appAsarPath,
    packageVersion: packageJson.version,
    appAsarSha256,
    customSchemes,
    target,
    versionKnown: versionTargets.length > 0,
  };
}
