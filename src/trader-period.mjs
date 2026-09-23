const installed = new WeakSet();

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function installPeriodFilters(view, state, save, render) {
  if (installed.has(view)) return;
  installed.add(view);
  view.addEventListener('change', event => {
    const field = event.target.closest('[data-filter]');
    if (!field) return;
    if (field.dataset.filter === 'from' || field.dataset.filter === 'to') {
      state.range = 'custom';
    } else if (field.dataset.filter === 'range') {
      const now = new Date();
      const current = localDate(now);
      if (field.value === 'all') {
        state.from = '';
        state.to = '';
      } else if (field.value === 'day') {
        state.from = current;
        state.to = current;
      } else if (field.value === 'month') {
        state.from = `${current.slice(0, 7)}-01`;
        state.to = current;
      } else if (field.value === 'week') {
        now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        state.from = localDate(now);
        state.to = current;
      }
    } else return;
    save();
    render(view);
  }, true);
}
