# 实施与验证报告

日期：2026-07-21

正式 Skill：`doubao-desktop-pet-builder/`

## 已完成

- 使用豆包官方 `init_skill.py` 初始化，最终保持普通文件夹结构。
- 三模式、四输入、单图母版路线、12 核心状态、38 扩展词表、修复副本策略和双端边界均已写入 Skill。
- Electron 模板采用 TypeScript + 原生 DOM + Webpack + Forge；三个窗口独立，启用隔离/sandbox/CSP/preload 白名单和 IPC 双重校验。
- 确定性工具已实现：spec 校验、工程脚手架、项目审计、角点连通抠图、去色边、512 归一化、锚点 QA、联系表、目标平台 Maker 和 SHA-256 清单。
- 全局打字依赖不进入默认安装。用户授权后执行 `npm run typing:install`；缺依赖、架构或权限失败时只关闭模块。
- 橘猫夹具压缩为母版 + 12 核心状态，用户工程默认不会复制；显式测试模式会生成醒目标记。
- 豆包三组前向测试、独立期望真值和思考记录审计表已放在本目录。

## 实测通过

| 检查 | 结果 |
|---|---|
| 豆包官方 `quick_validate.py` | 通过 |
| `pet-spec.json` Python 校验 | 通过 |
| 模板只读安全审计 | 33 个文本文件，0 项发现 |
| JS/MJS 语法检查 | 通过 |
| TypeScript `npm run check` | 通过 |
| 单元测试 | 8/8 通过 |
| 橘猫回归资产 QA | 12/12 通过 |
| 合成不透明纯色背景 → 连通抠图 | 13/13 处理成功，12/12 QA 通过 |
| Playwright Electron E2E | 通过：3 个独立窗口、右键面板、无 console/page error、截图成功 |
| Electron Forge Windows x64 package | 通过 |
| Squirrel Windows Maker | 通过；生成 132,214,784 字节未签名 Setup.exe |
| release SHA-256 清单 | 通过；验证样本 SHA-256 为 `36fcf35e260fdcf794829dd76ee410b77c227c6c34e56e552dee6ca2f284abc2` |
| soak 脚本冒烟 | 3 秒通过并生成报告 |

E2E 静态截图与联系表已人工查看：桌宠主体完整、透明背景有效、12 状态联系表没有明显裁切或空白。

## 验证中发现并修复

1. 旧回归素材仅缩小会导致 `walk/grab/peek` 锚点或触边失败；改为裁切后底部居中，没有放宽门槛。
2. 默认安装 `uiohook-napi` 会让 Forge 被原生重编译阻断；改为用户授权后显式安装。
3. `style-loader` 与严格 CSP 冲突；改为提取独立 CSS，E2E 重跑通过。
4. Windows Node 24 直接 `spawn npx.cmd` 返回 `EINVAL`；改为当前 Node 直接调用 Forge CLI 入口。
5. E2E 原先从错误的 `.webpack/main` 启动；改为 Forge 实际的架构目录 `.webpack/<arch>/main/index.js`。
6. 状态被临时反馈抢占时会丢失剩余时长；增加恢复栈和剩余时间回放测试。

## 待确认，不冒充完成

- 未把 Skill 同步到豆包云盘：官方要求调用 Doubao 内部的 `sync_skill_folder_to_cloud_disk`，当前 Codex 环境没有该工具。
- 三组豆包前向测试尚未在实际安装后的 Skill 中执行；测试材料已就绪。
- 未执行 Windows 真人安装短清单，也未运行正式 60 分钟 soak；只验证了脚本可运行。
- 当前不是 Mac，未生成/验证 `.dmg + .zip/.app`，未跑 Mac 真人清单或 60 分钟 soak。
- 未进行签名、公证、商店、Universal、自动更新等范围外工作。
- 公开提审前仍需确认用户上传图片和橘猫回归素材授权。
