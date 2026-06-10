import { el, clear } from '../../ui/dom.js';

export default {
  id: 'sizing',
  title: '2. Sizing',
  mount(panel) {
    clear(panel).append(
      el('div', { class: 'panel' },
        el('h2', {}, '2. Sizing'),
        el('p', { class: 'empty-note' }, 'Module not built yet.'),
      ),
    );
  },
};
