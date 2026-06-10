import { el, clear } from '../../ui/dom.js';

export default {
  id: 'tariffs',
  title: '4. Tariffs',
  mount(panel) {
    clear(panel).append(
      el('div', { class: 'panel' },
        el('h2', {}, '4. Tariffs'),
        el('p', { class: 'empty-note' }, 'Module not built yet.'),
      ),
    );
  },
};
