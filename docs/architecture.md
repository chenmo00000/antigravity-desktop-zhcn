# 架构与安全边界

## 数据流

```text
官方 app.asar ──读取版本和内部文件──> 四重指纹校验
运行中 /main.js ──HTTPS localhost──> UI bundle 指纹校验
原始 UI bundle + DOM 覆盖层 ───────> 本地 zh_cn_ui_main.js
官方 app.asar + 定点 customScheme 补丁 ─> 临时 patched app.asar
备份确认 + 原子替换 ───────────────> 已安装汉化
```

## 模块职责

- `asar-reader.mjs`：只读 ASAR 头和内部文件，不依赖第三方包。
- `installation.mjs`：安装路径、版本和静态指纹识别。
- `runtime-bundle.mjs`：只访问 Antigravity 日志里声明的本机 HTTPS UI 端口。
- `compatibility-candidate.mjs`：采集未验证的新版本候选指纹，不写白名单。
- `cleanup.mjs`：限定边界地清理可再生成文件，永不触碰备份。
- `diagnostics.mjs`：把常见失败转换成用户建议，并写入本地错误日志。
- `translator.mjs`：追加 DOM 覆盖层，不改写原 bundle 程序逻辑。
- `patcher.mjs`：严格锚点补丁、临时构建、原子替换。
- `state.mjs`：保存可验证的安装/恢复状态。
- `cli.mjs`：组合检查、预览、引导安装、安全清理、完全卸载和恢复工作流。

## 引导安装状态

```text
发现安装目录 → 静态指纹验证 → 获取/验证运行时 UI → 用户确认
→ 等待客户端退出 → 验证备份 → 原子安装 → 安装后复检 → 保存恢复状态
```

任何阶段失败都会在修改前停止，或在原子替换后尝试自动回滚。便携发布包只改变
Node.js 的来源，不改变 CLI、白名单或安装安全边界。

完全卸载只删除工具拥有的固定子路径。汉化仍在使用时，必须先通过原始备份与补丁
哈希验证完成恢复；未知或被修改的中文 UI 不会被强制删除。工具不会递归删除用户
自定义的状态根目录，也不会自动删除自身所在文件夹。

## 明确不做

- 不支持未知版本的模糊匹配。
- 不在用户项目、对话正文、代码编辑器中做全文替换。
- 不自动终止 Antigravity 进程。
- 不在版本更新后把旧备份恢复进新版本。
- 不从仓库分发官方 bundle 或 ASAR。
