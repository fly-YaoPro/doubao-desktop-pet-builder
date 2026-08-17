# 构建执行与交付

## 先体验，后封装

开发阶段只运行 `npm run dev`。它必须通过渲染器握手后输出 `DEV_PREVIEW_READY`；这只是开发预览。用户确认基础体验后再选择一种交付：

- `npm run package:win`：生成本机可直接运行的应用目录，适合先验收；其中 EXE 依赖同目录文件。
- `npm run make:win`：生成 Windows Squirrel `Setup.exe`。
- `npm run portable:win`：生成 Windows 便携 ZIP。
- `npm run make:mac`：在真实 Mac 生成 DMG。
- `npm run portable:mac`：在真实 Mac 生成 ZIP/App。

Windows 默认先做 `package:win`，把可直接双击的 EXE 及其所在目录交给用户继续验收；这是最快的可执行交付。只有用户明确需要安装器或传输压缩包时，再做 `make:win` 或 `portable:win`。ZIP 只是传输容器，不能替代对可执行文件路径的说明。

## 唯一受控构建

模板构建脚本必须：

1. `npm run dev` 与所有构建共用 `.build/activity.lock`；已有活跃开发或构建进程时拒绝并行启动。锁内 PID 已不存在时自动记录并回收过期锁，不把清理责任推给普通用户。
2. Windows 将 `TEMP`、`TMP` 和 Forge `outDir` 指向纯英文的外部隔离目录（优先 `%LOCALAPPDATA%/DoubaoPetBuilder/<project-key>`）；规避跨盘临时文件问题，也避开 Squirrel/rcedit 对中文项目路径的兼容缺陷。Mac 使用项目外临时目录。
3. 在开始前只清理项目内的生成目录；解析并验证绝对路径，不碰源码和素材。
4. 把 stdout/stderr 同时写入 `.build/build.log`，完成后复制到 `release/build.log`。
5. 每 15 秒刷新 `.build/status.json`，记录唯一 PID、模式、当前阶段、开始时间、更新时间和最终结果。
6. `package` 只做一次；Maker 使用 Forge 的 `--skip-package` 复用结果。
7. 总超时采用 `pet-spec.json` 的 `build.timeoutMinutes`，默认 20 分钟；超时后记录并失败，不自动重启。
8. 命令退出后才依据退出码和完整日志判断，不能凭 `.webpack`、`out` 或 `release` 是否存在猜测。

## 禁止反复换路

- `.webpack` 存在是正常状态，不是冲突证据。只有日志明确出现 `dest already exists` 且没有活跃进程时，才由受控脚本清理后重试一次。
- Squirrel 失败时保留已成功的 package 目录，但不得擅自改成 Forge ZIP、系统压缩或手工伪造 manifest 后宣称原目标完成。
- 如果用户同意改成交付便携版，运行固定 `portable:win` 命令并生成新的独立报告；不要现场修改 `forge.config.js`。
- 不要在构建过程中同时运行 `npm run dev`、`test:e2e` 或第二个 make。

## 成功标准

- `package:win`：`release/<应用>-win32-x64-ready-to-run/` 存在，EXE 能在该目录内启动；明确说明不能只复制 EXE。
- `make:win`：`release/` 中存在本轮新生成的 `Setup.exe` 和 manifest。
- `portable:win`：`release/` 中存在本轮新生成的 ZIP 和 manifest，解压后 EXE 能启动。
- Mac 同理核对 DMG 或 ZIP/App。
- manifest 由脚本从实际文件生成，记录版本、平台、架构、字节数、SHA-256、构建模式和日志路径。

未完成启动和真人清单时，只能写“构建产物已生成，真人验收待确认”。开发预览、ready-to-run EXE、Setup.exe 和 ZIP 必须分别命名，不得统称“最终版”。
