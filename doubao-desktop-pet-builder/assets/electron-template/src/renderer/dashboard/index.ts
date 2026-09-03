import './index.css';
import specData from '../../../pet-spec.json';
import type { PetScale, PetSpec, PetStats, Reminder, Settings } from '../../shared/contracts';

const spec = specData as PetSpec;
function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const form = requiredElement<HTMLFormElement>('#reminder-form');
const textInput = requiredElement<HTMLInputElement>('#reminder-text');
const timeInput = requiredElement<HTMLInputElement>('#reminder-time');
const list = requiredElement<HTMLUListElement>('#reminder-list');
const edgeSnap = requiredElement<HTMLInputElement>('#edge-snap');
const alwaysOnTop = requiredElement<HTMLInputElement>('#always-on-top');
const clickThrough = requiredElement<HTMLInputElement>('#click-through');
const typingReaction = requiredElement<HTMLInputElement>('#typing-reaction');
const petScale = requiredElement<HTMLSelectElement>('#pet-scale');
const typingStatus = requiredElement<HTMLElement>('#typing-status');
const openPocket = requiredElement<HTMLButtonElement>('#open-pocket');
const hidePet = requiredElement<HTMLButtonElement>('#hide-pet');
const interactionSection = requiredElement<HTMLElement>('#interaction-section');
const interactionActions = requiredElement<HTMLElement>('#interaction-actions');
const avatar = requiredElement<HTMLImageElement>('#character-avatar');
const assets = require.context('../../assets/pet', true, /\.png$/i);

function applyExperience(): void {
  const theme = spec.experience.theme;
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(theme)) {
    root.setProperty(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, name === 'cornerRadius' ? `${value}px` : String(value));
  }
  document.title = `${spec.character.displayName}的小屋`;
  requiredElement<HTMLElement>('#character-name').textContent = spec.character.displayName;
  requiredElement<HTMLElement>('#character-personality').textContent = spec.character.personality.join(' · ');
  avatar.src = assets(`./${spec.character.coreAsset}`);
  avatar.alt = spec.character.displayName;
  textInput.placeholder = `比如：提醒我给${spec.character.displayName}准备零食`;
  openPocket.hidden = !spec.features.filePocket;
  interactionSection.hidden = !spec.features.interactions;
}

function renderStats(stats: PetStats): void {
  const level = Math.min(6, Math.floor(stats.affection / 50) + 1);
  const titles = ['新朋友', '开始熟悉', '亲近伙伴', '默契搭档', '最佳拍档', '形影不离'];
  requiredElement<HTMLElement>('#level-label').textContent = `Lv.${level} ${titles[level - 1]}`;
  requiredElement<HTMLElement>('#affection-progress').style.width = `${Math.min(100, stats.affection / 3)}%`;
  requiredElement<HTMLElement>('#affection-copy').textContent = stats.affection >= 300 ? '已经是彼此最熟悉的伙伴啦' : `好感度 ${stats.affection} / 300`;
  requiredElement<HTMLElement>('#mood-value').textContent = String(stats.mood);
  requiredElement<HTMLElement>('#interaction-value').textContent = String(stats.todayInteractions);
  requiredElement<HTMLElement>('#companion-value').textContent = stats.companionMinutes < 60 ? `${stats.companionMinutes}m` : `${Math.floor(stats.companionMinutes / 60)}h`;
}

function renderInteractions(): void {
  const buttons = spec.experience.interactions.map((interaction) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'interaction-button';
    button.textContent = `${interaction.emoji} ${interaction.label}`;
    button.addEventListener('click', async () => renderStats((await window.petAPI.interactions.trigger(interaction.id)).stats));
    return button;
  });
  interactionActions.replaceChildren(...buttons);
}

function renderReminders(reminders: Reminder[]): void {
  const sorted = [...reminders].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  list.replaceChildren(...sorted.map((reminder) => {
    const item = document.createElement('li');
    const copy = document.createElement('div');
    copy.textContent = reminder.text;
    const time = document.createElement('small');
    time.textContent = new Date(reminder.dueAt).toLocaleString();
    copy.append(time);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '删除';
    remove.addEventListener('click', async () => { await window.petAPI.reminders.remove(reminder.id); await refreshReminders(); });
    item.append(copy, remove);
    return item;
  }));
}

async function refreshReminders(): Promise<void> { renderReminders(await window.petAPI.reminders.list()); }
function showSettings(settings: Settings): void {
  edgeSnap.checked = settings.edgeSnap;
  alwaysOnTop.checked = settings.alwaysOnTop;
  clickThrough.checked = settings.clickThrough;
  typingReaction.checked = settings.typingReaction;
  petScale.value = String(settings.petScale);
}
async function saveSettings(): Promise<void> {
  showSettings(await window.petAPI.settings.update({
    edgeSnap: edgeSnap.checked,
    alwaysOnTop: alwaysOnTop.checked,
    clickThrough: clickThrough.checked,
    typingReaction: typingReaction.checked,
    petScale: Number(petScale.value) as PetScale,
  }));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await window.petAPI.reminders.save({ text: textInput.value, dueAt: new Date(timeInput.value).toISOString() });
  form.reset();
  await refreshReminders();
});
[edgeSnap, alwaysOnTop, clickThrough, typingReaction, petScale].forEach((input) => input.addEventListener('change', () => void saveSettings()));
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.tab-panel').forEach((item) => item.classList.toggle('active', item.id === `${button.dataset.tab}-panel`));
}));
openPocket.addEventListener('click', () => void window.petAPI.files.openPocket());
hidePet.addEventListener('click', () => void window.petAPI.window.hidePet());
requiredElement<HTMLButtonElement>('#close-dashboard').addEventListener('click', () => void window.petAPI.window.hideDashboard());

const unsubscribeTyping = window.petAPI.events.onTypingStatus((status) => {
  typingStatus.textContent = status.enabled ? '打字响应已启用，不记录按键内容。' : `打字响应已关闭：${status.reason}`;
});
const unsubscribeStats = window.petAPI.events.onStats(renderStats);
window.addEventListener('beforeunload', () => { unsubscribeTyping(); unsubscribeStats(); });

applyExperience();
renderInteractions();
void Promise.all([refreshReminders(), window.petAPI.settings.get().then(showSettings), window.petAPI.interactions.stats().then(renderStats)]);
