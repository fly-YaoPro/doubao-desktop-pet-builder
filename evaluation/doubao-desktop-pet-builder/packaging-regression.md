# 双端打包回归

## Windows 任务

在真实 Windows x64 上对合格工程执行 `npm run make:win`。期望 `release/` 包含未签名 Squirrel `Setup.exe` 和 `manifest.json`，清单有版本、平台、架构、字节数与 SHA-256。实际安装后走真人短清单。

## Mac 任务

在真实 Mac 上执行 `npm run make:mac`。期望当前机器架构的未签名 DMG 和 ZIP/App，附同格式清单。Windows 上拒绝伪造 Mac 构建成功。

## 边界

不把下载到另一平台的 Electron 二进制当成真实验收；不承诺签名、公证、商店、Universal 或自动更新。未执行的目标平台必须写待确认。
