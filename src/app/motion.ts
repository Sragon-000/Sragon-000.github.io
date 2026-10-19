const entrySelector =
  '.editor-form, .project-editor, .project-editor-list > li, .project-card, .case-editor, .graph-item, .image-list figure, .preview-banner, .system-detail, .space-failure';
const statusSelector = '[role="status"], [role="alert"], .save-indicator';

/** One delegated listener/observer for the app; never postpones or repeats an action. */
export function installMotion(root: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Set<Animation>();
  const channels = new WeakMap<Element, Map<string, Animation>>();
  let layoutFrame: number | null = null;
  let previousRows = new Map<HTMLElement, DOMRect>();
  const play = (element: Element, channel: string, frames: Keyframe[], duration = 220) => {
    if (reduced.matches || !element.isConnected || typeof element.animate !== 'function') return;
    let running = channels.get(element);
    if (!running) {
      running = new Map();
      channels.set(element, running);
    }
    running.get(channel)?.cancel();
    const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)' });
    animation.id = `io-${channel}`;
    running.set(channel, animation);
    active.add(animation);
    const clear = () => {
      active.delete(animation);
      if (running?.get(channel) === animation) running.delete(channel);
    };
    void animation.finished.then(clear, clear);
  };
  const click = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest('button, a, summary, input[type="checkbox"], select');
    if (!(control instanceof HTMLElement) || control.matches(':disabled, [aria-disabled="true"]'))
      return;
    if (control.closest('.project-editor-list, dialog'))
      previousRows = new Map(
        [...root.querySelectorAll<HTMLElement>('.project-editor-list > li')].map((row) => [
          row,
          row.getBoundingClientRect(),
        ]),
      );
    play(control, 'press', [{ scale: '1' }, { scale: '.97', offset: 0.35 }, { scale: '1' }], 180);
  };
  const input = (event: Event) => {
    const field = event.target instanceof Element ? event.target.closest('.editor-field') : null;
    const label = field?.querySelector('label');
    if (label) play(label, 'input', [{ opacity: 0.7 }, { opacity: 1 }], 140);
  };
  const observer = new MutationObserver((records) => {
    const entries = new Set<Element>();
    const statuses = new Set<Element>();
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      const status = target?.closest(statusSelector);
      if (status) statuses.add(status);
      if (record.type === 'attributes' && target) {
        if (record.attributeName === 'aria-pressed' || record.attributeName === 'aria-current')
          play(target, 'select', [{ opacity: 0.6 }, { opacity: 1 }], 180);
        if (
          record.attributeName === 'aria-invalid' &&
          target.getAttribute('aria-invalid') === 'true'
        )
          play(
            target,
            'invalid',
            [
              { translate: '0' },
              { translate: '-3px', offset: 0.25 },
              { translate: '3px', offset: 0.5 },
              { translate: '0' },
            ],
            220,
          );
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element) || node.closest('.graph-svg, canvas')) continue;
        if (node.matches(entrySelector)) entries.add(node);
        else if (!node.matches('#root, main')) {
          for (const child of node.querySelectorAll(entrySelector)) {
            entries.add(child);
            if (entries.size >= 8) break;
          }
        }
      }
    }
    // Cap work when a large graph editor opens; no per-frame scan of the document.
    for (const element of [...entries].slice(0, 8))
      if (!element.parentElement?.closest(entrySelector))
        play(
          element,
          'enter',
          [
            { opacity: 0, translate: '0 8px' },
            { opacity: 1, translate: '0' },
          ],
          260,
        );
    for (const element of statuses)
      play(element, 'status', [{ opacity: 0.6 }, { opacity: 1 }], 200);
    if (previousRows.size && layoutFrame === null)
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = null;
        for (const [row, before] of previousRows) {
          if (!row.isConnected) continue;
          const after = row.getBoundingClientRect();
          const x = before.left - after.left,
            y = before.top - after.top;
          if (x || y)
            play(row, 'reorder', [{ translate: `${x}px ${y}px` }, { translate: '0' }], 260);
        }
        previousRows.clear();
      });
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-pressed', 'aria-current', 'aria-invalid'],
  });
  const hash = () => {
    const main = root.querySelector('main');
    if (main)
      play(
        main,
        'page',
        [
          { opacity: 0.5, translate: '0 8px' },
          { opacity: 1, translate: '0' },
        ],
        280,
      );
  };
  const preference = () => {
    if (reduced.matches) {
      for (const animation of active) animation.cancel();
      active.clear();
      previousRows.clear();
      if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
      layoutFrame = null;
    }
  };
  root.addEventListener('click', click, true);
  root.addEventListener('input', input, true);
  window.addEventListener('hashchange', hash);
  reduced.addEventListener('change', preference);
  return () => {
    observer.disconnect();
    root.removeEventListener('click', click, true);
    root.removeEventListener('input', input, true);
    window.removeEventListener('hashchange', hash);
    reduced.removeEventListener('change', preference);
    if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
    for (const animation of active) animation.cancel();
    active.clear();
  };
}
