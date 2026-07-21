import './index.css';

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}
const text = requiredElement<HTMLElement>('#reminder-text');
const time = requiredElement<HTMLTimeElement>('#reminder-time');

const unsubscribe = window.petAPI.events.onReminder((reminder) => {
  text.textContent = reminder.text;
  time.dateTime = reminder.dueAt;
  time.textContent = new Date(reminder.dueAt).toLocaleString();
});
window.addEventListener('beforeunload', unsubscribe);
