import './index.css';
import specData from '../../../pet-spec.json';
import type { PetSpec, Reminder } from '../../shared/contracts';

const spec = specData as PetSpec;
function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const composeView = requiredElement<HTMLElement>('#compose-view');
const dueView = requiredElement<HTMLElement>('#due-view');
const form = requiredElement<HTMLFormElement>('#quick-reminder-form');
const textInput = requiredElement<HTMLInputElement>('#quick-reminder-text');
const customTime = requiredElement<HTMLInputElement>('#custom-reminder-time');
const reminderText = requiredElement<HTMLElement>('#reminder-text');
const reminderTime = requiredElement<HTMLTimeElement>('#reminder-time');
let selectedMinutes: number | 'custom' = 5;

function applyExperience(): void {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(spec.experience.theme)) {
    root.setProperty(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, name === 'cornerRadius' ? `${value}px` : String(value));
  }
  textInput.placeholder = `比如：提醒我给${spec.character.displayName}准备零食`;
  requiredElement<HTMLElement>('#reminder-character-copy').textContent = `${spec.character.displayName}来提醒你了`;
}

function setComposeMode(): void {
  composeView.hidden = false;
  dueView.hidden = true;
  requiredElement<HTMLElement>('#window-eyebrow').textContent = spec.character.displayName;
  requiredElement<HTMLElement>('#window-title').textContent = '添加提醒';
  textInput.focus();
}

function setDueMode(reminder: Reminder): void {
  composeView.hidden = true;
  dueView.hidden = false;
  requiredElement<HTMLElement>('#window-eyebrow').textContent = '时间到了';
  requiredElement<HTMLElement>('#window-title').textContent = '小提醒';
  reminderText.textContent = reminder.text;
  reminderTime.dateTime = reminder.dueAt;
  reminderTime.textContent = new Date(reminder.dueAt).toLocaleString();
}

document.querySelectorAll<HTMLButtonElement>('[data-minutes]').forEach((button) => button.addEventListener('click', () => {
  const value = button.dataset.minutes;
  selectedMinutes = value === 'custom' ? 'custom' : Number(value);
  document.querySelectorAll('[data-minutes]').forEach((item) => item.classList.toggle('selected', item === button));
  customTime.hidden = selectedMinutes !== 'custom';
  customTime.required = selectedMinutes === 'custom';
  if (!customTime.hidden) customTime.focus();
}));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const dueAt = selectedMinutes === 'custom'
    ? new Date(customTime.value)
    : new Date(Date.now() + selectedMinutes * 60_000);
  if (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
    customTime.setCustomValidity('请选择未来的时间');
    customTime.reportValidity();
    return;
  }
  customTime.setCustomValidity('');
  await window.petAPI.reminders.save({ text: textInput.value, dueAt: dueAt.toISOString() });
  form.reset();
  await window.petAPI.window.hideReminder();
});

['#close-reminder', '#cancel-compose', '#dismiss-reminder'].forEach((selector) => requiredElement<HTMLButtonElement>(selector).addEventListener('click', () => void window.petAPI.window.hideReminder()));
const unsubscribeDue = window.petAPI.events.onReminder(setDueMode);
const unsubscribeCompose = window.petAPI.events.onReminderCompose(setComposeMode);
window.addEventListener('beforeunload', () => { unsubscribeDue(); unsubscribeCompose(); });

applyExperience();
setComposeMode();
