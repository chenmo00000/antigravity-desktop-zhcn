// Runs in Electron's main process; renderer DOM translations cannot reach these controls.
export function createNativeUiOverlay() {
  return `
;(() => {
  const { app, Tray, dialog } = require("electron");
  const marker = Symbol.for("antigravity-zhcn.native-ui");
  if (Tray.prototype[marker]) return;
  const labels = new Map([
    ["Quit", "退出"],
    ["Connect to WSL", "连接到 WSL"],
    ["Reopen Locally", "在本机重新打开"]
  ]);
  const originalSetContextMenu = Tray.prototype.setContextMenu;
  Tray.prototype.setContextMenu = function (menu, ...rest) {
    for (const item of menu?.items ?? []) {
      // Only top-level built-in tray entries: distro and custom submenu names stay intact.
      if (item.id === "running-agents") {
        if (item.label === "No agents running") item.label = "暂无智能体运行";
        else {
          const count = item.label.match(/^([0-9]+) agents? running$/u)?.[1];
          if (count !== undefined) item.label = count + " 个智能体正在运行";
        }
      } else if (item.label === "Open " + app.getName()) {
        item.label = "打开 " + app.getName();
      } else if (labels.has(item.label)) {
        item.label = labels.get(item.label);
      }
    }
    return Reflect.apply(originalSetContextMenu, this, [menu, ...rest]);
  };
  const originalShowMessageBox = dialog.showMessageBox;
  dialog.showMessageBox = function (...args) {
    const index = args.length - 1;
    const options = args[index];
    if (options?.title === "Confirm Quit" &&
        options.message === "Are you sure you want to quit?" &&
        options.detail === "There may be agents or background tasks running." &&
        options.buttons?.length === 2 && options.buttons[0] === "Cancel" && options.buttons[1] === "Quit") {
      args[index] = {
        ...options,
        title: "确认退出",
        message: "确定要退出吗？",
        detail: "可能仍有智能体或后台任务正在运行。",
        buttons: ["取消", "退出"]
      };
    }
    return Reflect.apply(originalShowMessageBox, this, args);
  };
  Object.defineProperty(Tray.prototype, marker, { value: true });
})();
`;
}
