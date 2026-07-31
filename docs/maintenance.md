# 新版本维护

1. 安装新的官方 Antigravity Desktop，确认客户端未安装本项目补丁。
2. 打开客户端并等待主界面加载，然后运行：

   ```powershell
   npm run collect:compatibility
   ```

   如需离线采集，可使用：

   ```powershell
   node scripts/collect-compatibility-candidate.mjs `
     --asar "D:\path\to\app.asar" `
     --ui-bundle "D:\path\to\main.js" `
     --custom-scheme "dist/customScheme.js"
   ```

3. 检查 `.runtime/compatibility-candidates` 中的候选文件。候选始终带
   `status: "candidate"` 和 `UNVERIFIED`，采集工具不会修改白名单。
4. 将候选指纹与官方安装包来源、签名和版本信息交叉核对。
5. 在不修改客户端的环境下运行 `preview`，核对 DOM 词典发现数量，并逐屏检查
   导航、设置、权限和账户页面。
6. 在 `app.asar` 副本上构建补丁，验证：
   - 内部版本未变化；
   - 原始 `plugin://` 处理仍然存在；
   - 新增 `agy-zhcn://` 处理存在；
   - 新 ASAR 可重新读取；
   - `node --check` 通过。
7. 只有完成真实启动、恢复和自动更新边界测试后，才能把新指纹加入
   `config/compatibility.json`。

兼容性图谱是精确白名单，不是“看起来相近”的版本范围。
