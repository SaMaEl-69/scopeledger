const carousel = document.getElementById('audienceCarousel');
const toggle = document.getElementById('carouselToggle');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let paused = false;

if (carousel && toggle) {
  const compact = matchMedia('(max-width: 600px)');
  const tracks = [...carousel.querySelectorAll('.mq-track')];
  function updateSpeed() {
    // Keep the reference's steady 34 px/s desktop and 26 px/s mobile pace.
    const pixelsPerSecond = compact.matches ? 26 : 34;
    for (const track of tracks) {
      const width = track.querySelector('.mq-set').getBoundingClientRect().width;
      const duration = `${(width / pixelsPerSecond).toFixed(3)}s`;
      if (track.style.getPropertyValue('--carousel-duration') !== duration) {
        track.style.setProperty('--carousel-duration', duration);
      }
    }
  }
  const layout = new ResizeObserver(updateSpeed);
  // Avoid continuously compositing the long lanes while they are off screen.
  const visibility = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        entry.target.dataset.inView = String(entry.isIntersecting);
      }
    },
    { rootMargin: '0px' },
  );
  for (const track of tracks) {
    const set = track.querySelector('.mq-set');
    const row = track.closest('.mq-row');
    const copy = set.cloneNode(true);
    copy.classList.add('mq-clone');
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('inert', '');
    track.append(copy);
    layout.observe(set);
    row.dataset.inView = 'false';
    visibility.observe(row);
  }
  compact.addEventListener('change', updateSpeed);
  updateSpeed();

  function updateControl() {
    carousel.dataset.paused = String(paused || motion.matches);
    toggle.setAttribute('aria-pressed', String(paused || motion.matches));
    toggle.disabled = motion.matches;
    toggle.querySelector('span').textContent = motion.matches
      ? 'Motion off · scroll to explore'
      : paused
        ? 'Resume carousel'
        : 'Pause carousel';
  }

  toggle.addEventListener('click', () => {
    paused = !paused;
    updateControl();
  });
  motion.addEventListener('change', updateControl);
  updateControl();
  toggle.hidden = false;
  carousel.classList.add('carousel-ready');
}
