# v4 配置契约与 Electron 模板

## `pet-spec.json` 是唯一真值

必须通过 `references/pet-spec.schema.json` 与 `scripts/validate_pet_spec.py`。v4 改为透明/仿透明网格优先的自适应连通泛洪，并增加帧密度、严格对齐、默认尺寸、托盘图标和无系统滚动条门禁；不要在页面或测试里重复硬编码角色名、互动、状态和配色。

- `app`：名称、应用 ID、版本、语言。
- `targets`：Windows/macOS 与架构。
- `character`：输入类型、核心资产、角色名、类型、性格、保留特征、风格和镜像许可。
- `assetPipeline`：`adaptive-flood`、生成背景策略、聚类容差、去色边、安全边距和目标占画布比例。不得为迁就单张图片改写配置或放宽阈值。
- `experience.theme`：角色色板与圆角半径。
- `experience.interactions`：2–6 个角色化互动，含独立 emoji、菜单文案、状态、持续时间、好感变化和短反馈。
- `experience.petSizing`：基础窗口像素和默认档位；默认 220px × 0.8，四档固定为 0.65/0.8/1/1.2。
- `motion`：呼吸周期/幅度、点击回弹、随机空闲间隔。
- `features`：提醒、互动、关系数据、面板、文件口袋、贴边、自动行走、打字响应等开关。
- `states`：状态 ID、帧、触发器、帧速、循环、优先级、中断、冷却、方向、锚点和镜像许可。
- `storage`：用户数据与文件口袋路径策略。
- `build`：Windows/Mac 格式、架构、总超时及 `unsigned: true`。

## 触发器

内置触发器包括：

- `app:start`、`ambient:idle`、`ambient:blink`、`ambient:random`；
- `pointer:tap`、`window:drag`、`window:edge-snap`；
- `reminder:due`、`typing:activity`；
- `file:drop`、`file:drop-success`、`file:drop-fail`；
- `movement:left`、`movement:right`；
- `interaction:<interaction-id>`。

同一状态可绑定多个入口。互动触发器必须与 `experience.interactions[].id` 一致。条件功能关闭时，其专属触发器不得出现。

## 模板约束

- TypeScript、原生 DOM、Webpack、Electron Forge。
- `contextIsolation: true`、renderer sandbox、CSP、`nodeIntegration: false`。
- preload 只暴露类型化 `window.petAPI`；IPC 校验发送方和载荷。
- 桌宠、提醒、面板独立。提醒和面板 `frame: false`，使用透明宿主与圆角内容容器。
- 右键菜单由 `experience.interactions` 和功能开关生成，不能写死猫类菜单；托盘和菜单文案统一使用语义化 emoji。
- 状态机优先级：系统/拖拽 > 用户互动 > 临时反馈 > 活动脉冲 > 空闲；所有定时器统一创建和销毁。
- 动作帧作用于图片，呼吸/回弹作用于外层 sprite，避免 transform 互相覆盖。
- 设置、提醒和关系数据写入 `app.getPath('userData')`，同目录临时文件后原子替换。
- 文件口袋使用 `Documents/<应用名>`；同名追加序号。
- 未捕获异常写 JSONL 并让自动测试失败。
- renderer 递归导入 `src/assets/pet`；`check` 同时核对 spec、实际文件、大小写、孤儿 PNG 和导入方式。
- `process:assets` 从 `incoming-assets` 读取原图，按状态共享缩放系数写入 `src/assets/pet`，并从核心资产生成 `src/assets/tray/tray-icon.png`。
- 面板与提醒的页面根节点透明且禁止页面级滚动；内部滚动容器隐藏系统滚动条，表单控件重置系统外观。
- 托盘只读取生成后的 PNG；`nativeImage.isEmpty()` 为真时启动失败，不使用 SVG data URL 猜测兼容性。
- 桌宠首帧加载后通过 `window.petAPI.runtime` 回报素材数、帧、状态和真实图片尺寸；主进程确认窗口可见后写 `.build/runtime-ready.json`。仅凭进程或编译日志不得判定成功。
- `uiohook-napi` 不进入默认依赖；用户授权后才安装，失败时保留关闭状态。

## `window.petAPI`

接口分为：

- `settings.get/update`
- `reminders.list/save/remove`
- `interactions.list/trigger/stats`
- `files.getPathForFile/put/openPocket`
- `window.beginDrag/updateDrag/endDrag/showContextMenu/showReminder/showDashboard/hideReminder/hideDashboard/hidePet`
- `events.onStateActivity/onReminder/onReminderCompose/onStats/onTypingStatus`
- `runtime.ready/fail`（仅桌宠 renderer 可调用，载荷在主进程校验）

监听方法返回退订函数。所有输入在主进程再校验。

## 固定命令

- `npm run dev`
- `npm run check`
- `npm test`
- `npm run qa:assets`
- `npm run qa:experience`
- `npm run qa:ui`
- `npm run test:e2e`
- `npm run package:win`
- `npm run make:win`
- `npm run portable:win`
- `npm run package:mac`
- `npm run make:mac`
- `npm run portable:mac`

构建命令遵循 [build-execution.md](build-execution.md)。`release/manifest.json` 必须来自真实文件，记录模式、版本、平台、架构、字节数、SHA-256 和日志。构建成功不等于真人验收完成。
