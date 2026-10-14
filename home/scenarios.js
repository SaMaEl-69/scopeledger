const carousel = document.getElementById('conversationScenarios');

if (carousel) {
  const track = carousel.querySelector('.conversation-track');
  const toggle = carousel.querySelector('#conversationToggle');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const touch = matchMedia('(hover: none)');
  let paused = false;

  const viewport = document.createElement('div');
  viewport.className = 'conversation-viewport';
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-roledescription', 'carousel');
  viewport.setAttribute('aria-label', 'Illustrative client conversations');
  const loop = document.createElement('div');
  loop.className = 'conversation-loop';
  loop.id = 'conversationLoop';
  track.replaceWith(viewport);
  viewport.append(loop);
  loop.append(track);

  const copy = track.cloneNode(true);
  copy.removeAttribute('id');
  copy.removeAttribute('tabindex');
  copy.removeAttribute('aria-label');
  copy.removeAttribute('aria-describedby');
  copy.classList.add('conversation-track-copy');
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('inert', '');
  for (const element of [copy, ...copy.querySelectorAll('*')]) {
    element.removeAttribute('id');
    element.removeAttribute('aria-labelledby');
    element.removeAttribute('aria-describedby');
  }
  loop.append(copy);

  function updateMotion() {
    const unavailable = motion.matches || touch.matches;
    carousel.dataset.paused = String(paused || unavailable);
    toggle.setAttribute('aria-pressed', String(paused || unavailable));
    toggle.disabled = unavailable;
    toggle.querySelector('span').textContent = motion.matches
      ? 'Motion off · all examples shown'
      : touch.matches
        ? 'Motion off · swipe to explore'
        : paused
          ? 'Resume carousel'
          : 'Pause carousel';
  }

  toggle.addEventListener('click', () => {
    paused = !paused;
    updateMotion();
  });
  motion.addEventListener('change', updateMotion);
  touch.addEventListener('change', updateMotion);

  track.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    viewport.scrollBy({
      left: (event.key === 'ArrowRight' ? 1 : -1) * viewport.clientWidth * 0.82,
      behavior: motion.matches ? 'instant' : 'smooth',
    });
  });

  carousel.dataset.inView = 'false';
  const visibility = new IntersectionObserver(([entry]) => {
    carousel.dataset.inView = String(entry.isIntersecting);
  });
  visibility.observe(carousel);

  updateMotion();
  toggle.hidden = false;
  carousel.dataset.ready = 'true';
}
