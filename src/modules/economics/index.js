import { el, clear } from '../../ui/dom.js';

export default {
  id: 'economics',
  title: '6. Deal Economics',
  mount(panel) {
    clear(panel).append(
      el('div', { class: 'panel' },
        el('h2', {}, '6. Deal Economics'),
        el('p', { class: 'empty-note' }, 'Module not built yet.'),
      ),
    );
  },
};
