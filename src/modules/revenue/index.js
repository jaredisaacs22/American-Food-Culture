import { el, clear } from '../../ui/dom.js';

export default {
  id: 'revenue',
  title: '5. Revenue Stack',
  mount(panel) {
    clear(panel).append(
      el('div', { class: 'panel' },
        el('h2', {}, '5. Revenue Stack'),
        el('p', { class: 'empty-note' }, 'Module not built yet.'),
      ),
    );
  },
};
