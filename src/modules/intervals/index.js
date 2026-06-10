import { el, clear } from '../../ui/dom.js';

export default {
  id: 'intervals',
  title: '1. Interval Data',
  mount(panel) {
    clear(panel).append(
      el('div', { class: 'panel' },
        el('h2', {}, '1. Interval Data'),
        el('p', { class: 'empty-note' }, 'Module not built yet.'),
      ),
    );
  },
};
