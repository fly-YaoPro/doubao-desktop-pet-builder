import './index.css';
import type { Reminder, Settings } from '../../shared/contracts';

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
const typingReaction = requiredElement<HTMLInputElement>('#typing-reaction');
const typingStatus = requiredElement<HTMLElement>('#typing-status');
const openPocket = requiredElement<HTMLButtonElement>('#open-pocket');
const hidePet = requiredElement<HTMLButtonElement>('#hide-pet');

function renderReminders(reminders: Reminder[]): void {
  list.replaceChildren(...reminders.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)).map((reminder) => {
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
  typingReaction.checked = settings.typingReaction;
}
async function saveSettings(): Promise<void> {
  showSettings(await window.petAPI.settings.update({ edgeSnap: edgeSnap.checked, alwaysOnTop: alwaysOnTop.checked, typingReaction: typingReaction.checked }));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await window.petAPI.reminders.save({ text: textInput.value, dueAt: new Date(timeInput.value).toISOString() });
  form.reset();
  await refreshReminders();
});
[edgeSnap, alwaysOnTop, typingReaction].forEach((input) => input.addEventListener('change', () => void saveSettings()));
openPocket.addEventListener('click', () => void window.petAPI.files.openPocket());
hidePet.addEventListener('click', () => void window.petAPI.window.hidePet());
const unsubscribeTyping = window.petAPI.events.onTypingStatus((status) => { typingStatus.textContent = status.enabled ? '打字响应已启用，不记录键值。' : `打字响应已关闭：${status.reason}`; });
window.addEventListener('beforeunload', unsubscribeTyping);

void Promise.all([refreshReminders(), window.petAPI.settings.get().then(showSettings)]);
