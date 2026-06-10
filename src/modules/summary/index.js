import { el, clear } from '../../ui/dom.js';

export default {
  id: 'summary',
  title: '7. Summary',
  mount(panel) {
    clear(panel).append(
      el('div', { class: 'panel' },
        el('h2', {}, '7. Summary'),
        el('p', { class: 'empty-note' }, 'Module not built yet.'),
      ),
    );
  },
};
