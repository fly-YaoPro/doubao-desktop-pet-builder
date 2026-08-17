---
name: doubao-desktop-pet-builder
description: 创建、体验迭代、诊断修复或打包 Electron 桌面宠物。适用于“把一张照片/角色图变成桌宠”“从文字制作桌宠”“给猫狗或其他角色设计专属互动”“修复已有桌宠”“打包 Windows EXE 或 Mac 版”等请求；支持单图、完整动作素材、文字描述和已有 Electron 工程。普通网页/H5、小程序、仅做 IP 形象设计或只生成几张角色图时不要触发。
---

# 豆包桌宠构建器

先判断模式，再执行对应流程。不要用网页应用替代桌面应用，不调用 `doubao-app-builder`。GUI 验收采用自动证据与用户/真人体验，不依赖 `computer-use`。

## 选择模式与引用

1. 从图片、素材或文字制作桌宠：读取 [creation-workflow.md](references/creation-workflow.md)、[experience-design.md](references/experience-design.md)、[asset-pipeline.md](references/asset-pipeline.md)。
2. 修复、补功能或稳定已有桌宠：读取 [repair-and-packaging.md](references/repair-and-packaging.md)。默认复制独立修复副本，排除 `node_modules`、`.webpack`、`out`、`release`；只有用户明确要求才原地修改。
3. 只打包已有工程：读取 [repair-and-packaging.md](references/repair-and-packaging.md) 与 [build-execution.md](references/build-execution.md)。

所有模式都必须读取 [failure-gates-and-qa.md](references/failure-gates-and-qa.md) 与 [user-communication.md](references/user-communication.md)。涉及代码、配置或打包时还读取 [spec-and-template.md](references/spec-and-template.md)。

## 创建模式固定顺序

1. 确认输入类型、视觉保真方向、角色身份和目标平台。默认 Windows x64；Mac 只在真实 Mac 上构建当前架构。
2. 根据真实角色设计 2–4 个首版互动。猫可考虑摸头、喂小鱼干、逗猫；狗应改为挠下巴、喂骨头、接球等。不要把猫的文案和道具机械套给其他角色。
3. 生成并校验 v4 `pet-spec.json`。默认让生图模型输出“透明 PNG 素材预览”，允许它生成浅色仿透明网格，再由 `adaptive-flood` 从画布边缘识别并清除；不要再要求模型复现精确 HEX，也不得把模型生成的渐变背景改写成新的配置色来迁就。每个状态必须声明 `triggers`，互动必须绑定真实状态，禁止先生成一批图再猜用途。
4. 创建或标准化唯一 `core-ip` 并让用户确认。单图默认适度卡通化，允许改为保留原貌或只提取标志元素。
5. 只从确认的 `core-ip` 用 `image_edit` 衍生动作。每个可见动作默认规划 5 帧，幅度较大时用 6 帧；眨眼采用睁眼→半闭→闭眼→半开→睁眼。按单个状态成组生成，固定身体尺度、镜头和脚底基线，不把不同动作混在同一生成批次。再叠加轻微呼吸与压缩回弹，不能用程序形变掩盖动作素材缺失。
6. 抠图、按状态成组归一化、锚点对齐并生成“动作 × 触发功能”联系表和对齐联系表。联系表必须同时展示帧、入口和尺寸漂移指标；底色、地面、投影、残留色块或肉眼可见缩放跳变都必须返工。
7. 用 `scripts/scaffold_project.py` 创建工程；缺少依赖时只运行一次锁文件安装 `npm ci`，禁止临时安装单个图像库或另写替代抠图脚本；随后固定运行 `npm run process:assets`，再依次运行 `npm run check`、`npm test`、`npm run qa:assets`、`npm run qa:experience`、`npm run qa:ui`。
8. 运行 `npm run dev` 打开基础版。只有看到 `DEV_PREVIEW_READY`，且报告中的素材数、图片尺寸、窗口数和当前状态全部合格，才能称为“开发预览已启动”。让用户实际摸、喂、拖、设提醒并看面板；明确这还不是最终版，也尚未打包。
9. 根据体验提出 2–4 个与角色匹配的增补建议，由用户选择后局部迭代；不要默认把全部功能一次塞满。
10. 用户确认体验后再运行 `npm run test:e2e`，按 [build-execution.md](references/build-execution.md) 构建目标产物并完成真人清单。

## 核心门禁

- 资产存在不等于功能完成。`qa:experience` 必须证明每个状态可达、每个互动有入口、每个启用功能有反馈。
- 新生成首版的待机至少 4 帧，眨眼与可见反馈至少 5 帧，首版互动每项 5–6 帧；3 帧只允许用于用户明确接受的极短微动作，不得作为默认方案。
- 面板和提醒窗必须无系统标题栏、无宿主底色框、无系统滚动条，采用角色色板、圆角卡片、清楚层级和角色化文案；原生表单控件必须重置外观。右键菜单与托盘菜单使用克制且语义匹配的 emoji。
- 托盘图标必须从确认的 `core-ip` 生成透明 PNG，并在运行时验证 `nativeImage.isEmpty() === false`；禁止用未经验证的 SVG data URL 或交付空白图标。
- 默认桌宠应以约 130–170px 的可见主体起步，并提供迷你/小/标准/大四档；最小档不得仍接近 200px。
- 先预览再扩展，先 `dev` 再 `package/make`。用户未确认基础体验时不要进入安装包构建。
- 构建只能启动一个受控任务，保存完整日志和状态；不得按 1–3 分钟猜测超时、反复停止重来，或把 `.webpack` 存在当成冲突证据。
- Webpack 编译完成、Electron 进程存在或 Forge 输出 `Launched Electron app` 都不等于桌宠可见。素材链接、`naturalWidth`、渲染器就绪和窗口可见性任一未证实时，不得宣称启动成功。
- 依赖准备是内部确定性步骤。不要对用户说“某个库比我写的靠谱”，不要临时 `pip install Pillow`、`npm install sharp` 或边做边换抠图方案。
- Squirrel 失败时保留日志并报告，不得擅自改 Forge 配置、手工压 ZIP、伪造清单或把替代产物冒充原目标。

## 输出边界

- 开发预览：`npm run dev`，只用于当前机器试玩，不能称为最终版或交付包。
- Windows 首次可执行交付默认运行 `npm run package:win`，直接指出 `release/<应用>-win32-x64-ready-to-run/<应用>.exe`；该 EXE 依赖同目录文件，不能单独拎走。安装版 `Setup.exe` 或传输用 ZIP 仅在用户明确选择后再做，ZIP 不能作为唯一的“可执行程序”答复。
- Mac 在真实 Mac 上先生成并验证 `.app`；用户明确需要分发格式时再生成未签名 `.dmg` 或 ZIP。
- 明确提示未签名应用可能触发系统安全警告。
- 不承诺代码签名、公证、应用商店、Universal 包、自动更新、云同步、账号、语音或联网 AI 对话。
- 全局打字响应必须获得明确授权；只产生活动脉冲，不读取或保存键值，失败时自动降级。

## 确定性工具

- `python scripts/validate_pet_spec.py <pet-spec.json>`：校验配置、功能触发和动态帧门禁。
- `python scripts/scaffold_project.py --spec <pet-spec.json> --assets <素材目录> --output <新目录>`：创建独立工程，默认拒绝覆盖。
- `python scripts/audit_project.py <工程目录> --json <报告路径>`：只读审计安全、功能覆盖、路径和打包配置。

脚本失败时解决原因，不得绕过检查、硬改报告或用重新生图代替确定性修复。
