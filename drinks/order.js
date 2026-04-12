import { transition, unleashConfetti } from './ui.js';

/**
 * Handle formatting and sending the SMS order, alongside showing the
 * success feedback in the UI.
 *
 * @param {string} drinkName
 * @param {string} recipe
 * @param {HTMLElement | null} appContainer
 */
export function sendOrder(drinkName, recipe, appContainer) {
  const bodyText = `New Order! ☕\nDrink: ${drinkName}\nRecipe: ${recipe}\n`;
  const body = encodeURIComponent(bodyText);

  const phone = atob('MzE0MzQxODA4MA==');
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const separator = isIOS ? '&' : '?';

  setTimeout(() => {
    window.location.href = `sms:${phone}${separator}body=${body}`;
  }, 1000);

  const isTea =
    drinkName.toLowerCase().includes('tea') ||
    drinkName.toLowerCase().includes('matcha');
  const isCocoa =
    drinkName.toLowerCase().includes('chocolate') ||
    drinkName.toLowerCase().includes('cocoa');

  let actionText = 'Andrew is violently assaulting the espresso grinder.';
  if (isTea) actionText = 'Andrew is gently coaxing the kettle to life.';
  if (isCocoa) actionText = 'Andrew is warming up the choccy milk.';

  transition(appContainer, () => {
    if (!appContainer) return;
    appContainer.innerHTML = `
      <div class="animate-in" style="font-size: 3.5rem; margin-bottom: 16px;">🎉</div>
      <h2 class="highlight animate-in" style="animation-delay: 0.05s;">Order Sent!</h2>
      <p class="animate-in" style="animation-delay: 0.1s; color: var(--text-muted); font-size: 1.1rem;">${actionText}<br><br>He has been alerted and is legally obligated to make this.</p>
      <button type="button" class="btn btn-secondary animate-in" style="animation-delay: 0.15s; margin-top: 32px;" id="restart-btn">I panicked, start over 😰</button>
    `;
    setTimeout(() => unleashConfetti(appContainer), 50);
  });
}
