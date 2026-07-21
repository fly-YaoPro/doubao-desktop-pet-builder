# 配置契约与 Electron 模板

## `pet-spec.json` 是唯一真值

必须通过 `references/pet-spec.schema.json` 和 `scripts/validate_pet_spec.py`。不要把状态、路径或开关重复硬编码在多个页面。

- `app`：名称、应用 ID、版本、语言。
- `targets`：Windows/macOS 与架构。
- `character`：输入类型、核心资产、保留特征、风格、镜像许可。
- `features`：提醒、面板、文件口袋、贴边、托盘、打字响应。
- `states`：ID、帧、时长、循环、优先级、中断策略、冷却、方向、锚点、镜像许可。
- `storage`：用户数据和文件口袋路径策略。
- `build`：Maker、架构、`unsigned: true`。

## 模板约束

- TypeScript、原生 DOM、Webpack、Electron Forge。
- `contextIsolation: true`、renderer sandbox、CSP、`nodeIntegration: false`。
- preload 只暴露类型化 `window.petAPI`；禁止暴露完整 `ipcRenderer` 或任意文件系统调用。
- IPC 同时校验发送方和载荷。窗口关闭后撤销发送方授权。
- 桌宠、提醒、数据面板是独立窗口。不要把面板塞进透明小窗后再靠扩大桌宠窗口补救。
- 唯一状态机的优先级：系统/拖拽 > 用户交互 > 临时反馈 > 活动脉冲 > 空闲。计时器由同一控制器创建和销毁。
- Pointer Capture 只负责 renderer 手势；主进程以 `screen.getCursorScreenPoint()` 的 DIP 坐标和窗口初始绝对位置计算拖拽。按所在显示器工作区贴边。
- 设置和提醒位于 `app.getPath('userData')`，同目录临时文件后原子替换。
- 文件口袋默认 `Documents/<应用名>`；同名自动加序号，不硬编码盘符。
- 未捕获异常写 JSONL 日志并让自动测试失败，不能全局吞掉。
- `uiohook-napi` 不进入默认依赖树。用户明确授权后才执行 `npm run typing:install`；安装、重编译、架构或权限失败时保留关闭状态并继续主程序。

## `window.petAPI`

接口仅分为：

- `settings.get()` / `settings.update(patch)`
- `reminders.list()` / `reminders.save(input)` / `reminders.remove(id)`
- `files.getPathForFile(file)` / `files.put(paths)` / `files.openPocket()`
- `window.beginDrag()` / `window.updateDrag()` / `window.endDrag()` / `window.showDashboard()` / `window.hidePet()`
- `events.onStateActivity(listener)` / `events.onReminder(listener)` / `events.onTypingStatus(listener)`

监听方法必须返回退订函数。所有输入在主进程再校验。

## 固定命令

- `npm run dev`
- `npm run check`
- `npm test`
- `npm run test:e2e`
- `npm run qa:assets`
- `npm run make:win`
- `npm run make:mac`

Windows 命令只在 Windows 主机生成 Squirrel `Setup.exe`；Mac 命令只在真实 Mac 生成当前架构 DMG 与 ZIP/App。原生依赖未通过 x64、arm64 双架构预检时不承诺 Universal。

`release/manifest.json` 必须记录版本、平台、架构、相对路径、字节数和 SHA-256。构建成功不代表安装、启动、托盘和权限降级已通过。
