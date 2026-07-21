import { readFile } from 'node:fs/promises';

const spec = JSON.parse(await readFile(new URL('../pet-spec.json', import.meta.url), 'utf8'));
const required = ['idle', 'blink', 'walk-left', 'walk-right', 'happy', 'sleep', 'typing', 'notify', 'grab', 'success', 'fail', 'peek'];
const errors = [];
if (spec.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
if (!/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9-]+)+$/.test(spec.app?.appId ?? '')) errors.push('app.appId must be a reverse-domain identifier');
if (spec.features?.transparentWindow !== true) errors.push('transparentWindow must be true');
if (spec.build?.unsigned !== true) errors.push('v1 build must explicitly be unsigned');
if (spec.build?.windowsArch !== 'x64') errors.push('Windows architecture must be x64');
if (spec.storage?.userData !== 'app-user-data' || spec.storage?.filePocket !== 'documents-app-name') errors.push('storage paths must use cross-platform policies');
const ids = new Set((spec.states ?? []).map((state) => state.id));
for (const id of required) if (!ids.has(id)) errors.push(`missing core state: ${id}`);
for (const state of spec.states ?? []) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state.id)) errors.push(`invalid state id: ${state.id}`);
  if (!Array.isArray(state.frames) || state.frames.length < 1) errors.push(`state has no frames: ${state.id}`);
  for (const frame of state.frames ?? []) if (/^[A-Za-z]:|^[/\\]|(?:^|[/\\])\.\.(?:[/\\]|$)/.test(frame)) errors.push(`unsafe frame path: ${frame}`);
}
if (errors.length) {
  console.error(`Invalid pet-spec.json:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  process.exit(1);
}
console.log(`Valid pet-spec.json with ${spec.states.length} states.`);
