const status = document.querySelector('#action-status');
document.querySelectorAll('[data-demo]').forEach(button => {
  button.addEventListener('click', () => { status.textContent = button.dataset.demo; });
});
document.querySelector('#demo-save').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  status.textContent = 'Saving preview…';
  await new Promise(resolve => setTimeout(resolve, 1200));
  button.removeAttribute('aria-busy');
  button.disabled = false;
  status.textContent = 'Preview complete. No data was saved.';
});
document.querySelector('#password-reveal').addEventListener('click', event => {
  const button = event.currentTarget;
  const field = document.querySelector('#example-password');
  const show = field.type === 'password';
  field.type = show ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(show));
});
document.querySelectorAll('[data-segments]').forEach(group => {
  group.addEventListener('click', event => {
    const selected = event.target.closest('button');
    if (!selected) return;
    for (const button of group.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button === selected));
    group.parentElement.querySelector('[data-selection-status]').textContent = `${selected.textContent} selected.`;
  });
});

const demoFilters = document.querySelector('#demo-filter-chips');
const demoFilterStatus = document.querySelector('#filter-demo-status');
const resetFilters = document.querySelector('#reset-demo-filters');
demoFilters.addEventListener('click', event => {
  const chip = event.target.closest('.ui-filter-chip');
  if (!chip) return;
  chip.hidden = true;
  const remaining = [...demoFilters.querySelectorAll('.ui-filter-chip')].filter(item => !item.hidden);
  demoFilterStatus.textContent = remaining.length ? `${remaining.length} filters applied.` : 'No filters applied.';
  (remaining[0] || resetFilters).focus();
});
resetFilters.addEventListener('click', () => {
  demoFilters.querySelectorAll('.ui-filter-chip').forEach(chip => { chip.hidden = false; });
  demoFilterStatus.textContent = 'Three filters applied.';
});

document.querySelector('#demo-map-filters').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
  const selected = [...document.querySelectorAll('#demo-map-filters [aria-pressed="true"]')]
    .map(item => item.querySelector('[data-map-label]').textContent);
  document.querySelector('#map-filter-status').textContent =
    `${selected.length ? selected.join(', ') + ' selected.' : 'No categories selected.'} Example counts only.`;
});
