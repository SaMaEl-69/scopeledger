const carousel = document.getElementById('audienceCarousel');
const toggle = document.getElementById('carouselToggle');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let paused = false;

if (carousel && toggle) {
  for (const track of carousel.querySelectorAll('.mq-track')) {
    const copy = track.querySelector('.mq-set').cloneNode(true);
    copy.classList.add('mq-clone');
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('inert', '');
    track.append(copy);
  }

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
