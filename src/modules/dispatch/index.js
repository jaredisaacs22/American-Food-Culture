import { el, clear } from '../../ui/dom.js';

export default {
  id: 'dispatch',
  title: '3. Dispatch',
  mount(panel) {
    clear(panel).append(
      el('div', { class: 'panel' },
        el('h2', {}, '3. Dispatch'),
        el('p', { class: 'empty-note' }, 'Module not built yet.'),
      ),
    );
  },
};
