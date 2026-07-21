---
name: doubao-desktop-pet-builder
description: 创建、诊断修复或打包 Electron 桌面宠物。适用于“把一张照片/角色图变成桌宠”“从文字制作桌宠”“修复已有桌宠”“打包 Windows EXE 或 Mac 版”等请求；支持单图、完整动作素材、文字描述和已有 Electron 工程。普通网页/H5、小程序、仅做 IP 形象设计或只生成几张角色图时不要触发。
---

# 豆包桌宠构建器

先判断任务模式，再执行对应流程。不要用网页应用替代桌面应用，不调用 `doubao-app-builder`，不依赖 `computer-use`。

## 选择模式

1. 用户要从图片、素材或文字得到桌宠：进入创建模式，读取 [creation-workflow.md](references/creation-workflow.md)。
2. 用户提供已有桌宠并要求排错、稳定或补功能：进入修复模式，读取 [repair-and-packaging.md](references/repair-and-packaging.md)。默认复制独立修复副本，排除 `node_modules`、`out`、`release`；只有用户明确要求才原地修改。
3. 用户只要把已有工程打成安装包：进入打包模式，读取 [repair-and-packaging.md](references/repair-and-packaging.md)。先审计和运行测试，不能把“构建命令返回 0”当成应用已验收。

所有模式都必须读取 [failure-gates-and-qa.md](references/failure-gates-and-qa.md)。涉及素材时还必须读取 [asset-pipeline.md](references/asset-pipeline.md)；涉及代码、配置或打包时读取 [spec-and-template.md](references/spec-and-template.md)。

## 创建模式固定顺序

1. 确认输入类型、桌宠定位、目标平台和功能开关。默认 Windows x64；Mac 只在真实 Mac 上构建当前机器架构。提醒、面板、文件口袋、贴边默认开启；全局打字响应默认关闭。
2. 生成并校验 `pet-spec.json`，它是名称、状态、路径、功能和打包目标的唯一真值。用户未提供的信息采用参考文件中的默认值，不反复追问低风险细节。
3. 创建或标准化唯一 `core-ip`，展示给用户确认。单图默认“适度卡通化”；允许用户改为“保留原貌”或“只提取标志元素”。
4. 只从已确认的 `core-ip` 用 `image_edit` 衍生动作。纯文字输入只有第一次创建 `core-ip` 可用 `image_gen`。禁止每个动作独立文生图。
5. 执行确定性抠图、透明度检查、裁切、512×512 归一化和锚点对齐；生成 12 状态联系表并让用户确认。模型声称“透明 PNG”不算证据。
6. 用 `scripts/scaffold_project.py` 从 `assets/electron-template` 创建工程并注入已确认素材。用户目录中不得混入橘猫回归夹具。
7. 依次执行 `npm run check`、`npm test`、`npm run qa:assets`、`npm run test:e2e`。修复失败，不得吞掉异常或把未运行写成通过。
8. 在对应真实系统执行 `npm run make:win` 或 `npm run make:mac`，汇总到 `release/`，核对 SHA-256 清单。
9. 按真人清单验收并输出报告。未实测项标记“待确认”，不要写“已完成”。

## 输出边界

- Windows：未签名 x64 `Setup.exe`。Mac：在真实 Mac 上生成当前架构的未签名 `.dmg` 与 `.zip/.app`。
- 明确提示未签名应用可能触发系统安全警告。
- 不承诺代码签名、公证、应用商店、Universal 包、自动更新、云同步、账号、语音或联网 AI 对话。
- 全局打字响应只能在用户明确授权后开启；只把任意 `keydown` 转成活动脉冲，不读取、不保存按键内容。权限、依赖或架构不满足时自动关闭该模块，主程序继续运行。

## 确定性工具

- `python scripts/validate_pet_spec.py <pet-spec.json>`：校验公共配置契约。
- `python scripts/scaffold_project.py --spec <pet-spec.json> --assets <动作素材目录> --output <新目录>`：创建独立工程；默认拒绝覆盖。
- `python scripts/audit_project.py <工程目录> --json <报告路径>`：只读审计安全、路径、打包和测试配置。

这些脚本失败时先解决失败原因。不得绕过检查、硬改报告或用重新生图代替确定性修复。
