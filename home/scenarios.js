const conversations = document.getElementById('conversationScenarios');

if (conversations) {
  const track = conversations.querySelector('.conversation-track');
  const cards = [...track.querySelectorAll('.conversation-card')];
  const controls = conversations.querySelector('.conversation-navigation');
  const previous = controls.querySelector('[data-scenario-previous]');
  const next = controls.querySelector('[data-scenario-next]');
  const count = controls.querySelector('.conversation-count');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  function layout() {
    const gap = parseFloat(getComputedStyle(track).columnGap);
    const stride = cards[0].getBoundingClientRect().width + gap;
    const visible = Math.max(1, Math.floor((track.clientWidth - 8 + gap) / stride + 0.001));
    const first = Math.max(
      0,
      Math.min(cards.length - visible, Math.round(track.scrollLeft / stride)),
    );
    return { stride, visible, first, maximum: track.scrollWidth - track.clientWidth };
  }

  function update() {
    const { visible, first, maximum } = layout();
    const label =
      visible === 1
        ? `Scenario ${first + 1} of ${cards.length}`
        : `Scenarios ${first + 1}–${Math.min(first + visible, cards.length)} of ${cards.length}`;
    if (count.textContent !== label) count.textContent = label;
    previous.setAttribute('aria-disabled', String(track.scrollLeft <= 1));
    next.setAttribute('aria-disabled', String(track.scrollLeft >= maximum - 1));
  }

  function move(direction, control) {
    if (control.getAttribute('aria-disabled') === 'true') return;
    const { stride, first, maximum } = layout();
    track.scrollTo({
      left: Math.max(0, Math.min(maximum, (first + direction) * stride)),
      behavior: motion.matches ? 'instant' : 'smooth',
    });
  }

  previous.addEventListener('click', () => move(-1, previous));
  next.addEventListener('click', () => move(1, next));
  track.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(track);
  update();
  controls.hidden = false;
}
