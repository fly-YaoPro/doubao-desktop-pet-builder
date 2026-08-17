const path = require('node:path');
const spec = require('./pet-spec.json');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const buildMode = process.env.PET_BUILD_MODE || 'all';

const makers = [];
if (buildMode === 'all' || buildMode === 'installer') makers.push({
  name: '@electron-forge/maker-squirrel',
  platforms: ['win32'],
  config: {
    name: spec.app.appId.replace(/[^a-zA-Z0-9]/g, '_'),
    setupExe: `${spec.app.name}-${spec.app.version}-x64-Setup.exe`,
  },
});
if (buildMode === 'all' || buildMode === 'dmg') makers.push({
  name: '@electron-forge/maker-dmg',
  platforms: ['darwin'],
  config: { format: 'ULFO', name: spec.app.name },
});
if (buildMode === 'all' || buildMode === 'portable') makers.push({
  name: '@electron-forge/maker-zip',
  platforms: ['win32', 'darwin'],
  config: {},
});

module.exports = {
  outDir: process.env.PET_BUILD_OUT || 'out',
  packagerConfig: {
    asar: true,
    appBundleId: spec.app.appId,
    name: spec.app.name,
    executableName: spec.app.name,
    osxSign: false,
  },
  rebuildConfig: {},
  makers,
  plugins: [
    { name: '@electron-forge/plugin-auto-unpack-natives', config: {} },
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: path.resolve(__dirname, 'webpack.main.config.js'),
        renderer: {
          config: path.resolve(__dirname, 'webpack.renderer.config.js'),
          entryPoints: [
            { html: './src/renderer/pet/index.html', js: './src/renderer/pet/index.ts', name: 'pet_window', preload: { js: './src/preload.ts' } },
            { html: './src/renderer/reminder/index.html', js: './src/renderer/reminder/index.ts', name: 'reminder_window', preload: { js: './src/preload.ts' } },
            { html: './src/renderer/dashboard/index.html', js: './src/renderer/dashboard/index.ts', name: 'dashboard_window', preload: { js: './src/preload.ts' } },
          ],
        },
      },
    },
    {
      name: '@electron-forge/plugin-fuses',
      config: {
        version: FuseVersion.V1,
        [FuseV1Options.RunAsNode]: false,
        [FuseV1Options.EnableCookieEncryption]: true,
        [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
        [FuseV1Options.EnableNodeCliInspectArguments]: false,
        [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
        [FuseV1Options.OnlyLoadAppFromAsar]: true,
      },
    },
  ],
};
