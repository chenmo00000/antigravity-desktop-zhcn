# GitHub 发布

## 自动检查

`.github/workflows/ci.yml` 会在 `main` 推送、Pull Request 和手动触发时，在
Windows 与 Node.js 22.12.0 上执行：

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run validate
```

项目校验同时检查六个 BAT 的 CRLF、便携运行时入口和工作流所需命令。
Dependabot 每月检查 npm 锁文件和 GitHub Actions 主版本更新。

## 便携包

本地构建：

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build:portable
```

产物位于 `.runtime/release`：

- `antigravity-desktop-zhcn-portable-win-x64.zip`
- `antigravity-desktop-zhcn-portable-win-x64.zip.sha256`

构建脚本从 `nodejs.org` 临时下载锁定的 Node.js 22.12.0 Windows x64 ZIP，并使用
官方 `SHASUMS256.txt` 校验下载文件。发布包只包含 `node.exe` 和 Node 许可证，下载
临时目录会在成功或失败后清理。生产依赖来自当前 `package-lock.json`，构建前必须
已通过 `npm ci` 安装。

## GitHub Release

`.github/workflows/release.yml` 支持手动运行并上传 Actions Artifact。推送 `v*` 标签
时，还会使用仓库的 `GITHUB_TOKEN` 创建对应 Release，上传 ZIP 和 SHA-256 文件。

发布前仍需人工确认：

1. 支持版本与 `config/compatibility.json` 一致；
2. `npm test` 和 `npm run validate` 通过；
3. 使用便携包内置 `runtime/node.exe` 成功运行兼容性检查；
4. Release 页面说明未知版本会被拒绝，不承诺模糊兼容。
