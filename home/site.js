const lifetime = document.getElementById('lifetimeDialog');
const information = document.getElementById('informationDialog');
const purchaseStatus = document.getElementById('purchaseStatus');
const planLinks = [...lifetime.querySelectorAll('[data-plan]')];
let statusRequest;
let opener;

function checkoutUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !(url.hostname === 'gumroad.com' || url.hostname.endsWith('.gumroad.com'))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function resetPlans() {
  for (const link of planLinks) {
    link.href = `/workspace/?activate=1&plan=${link.dataset.plan}`;
    link.removeAttribute('target');
    link.removeAttribute('rel');
  }
}

async function updatePlans() {
  if (statusRequest) return statusRequest;
  resetPlans();
  purchaseStatus.textContent = 'Checking purchase availability…';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  statusRequest = (async () => {
    try {
      const response = await fetch('/api/license/status', {
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('status_unavailable');
      const status = await response.json();
      if (status.configured === true && status.mode === 'live') {
        let available = 0;
        for (const link of planLinks) {
          const url = checkoutUrl(status.checkout?.[link.dataset.plan]);
          if (url) {
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            available += 1;
          }
        }
        purchaseStatus.textContent =
          available === 2
            ? 'Secure purchase opens on Gumroad. Activate your license in the workspace afterward.'
            : 'Purchase setup is incomplete. You can try the workspace or activate an existing license.';
      } else {
        purchaseStatus.textContent =
          'Purchases are not available yet. Try the workspace or activate an existing license.';
      }
    } catch {
      purchaseStatus.textContent =
        'Purchase availability could not be checked. The demo workspace remains available.';
    } finally {
      clearTimeout(timeout);
      statusRequest = undefined;
    }
  })();
  return statusRequest;
}

function openDialog(dialog, trigger) {
  if (dialog.open) return;
  opener = trigger.closest('#mnav') ? document.getElementById('menuBtn') : trigger;
  if (document.documentElement.classList.contains('menu-open'))
    document.getElementById('menuBtn').click();
  const menu = document.getElementById('menuBtn');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Open menu');
  document.getElementById('mcta').style.visibility = '';
  dialog.showModal();
  document.documentElement.classList.add('dialog-open');
}

function closeDialog(dialog) {
  dialog.close();
}

const info = {
  privacy: {
    title: 'Privacy overview',
    paragraphs: [
      'Projects, clients, financial estimates and manual records stay in this browser. The workspace has no customer account or cloud synchronization. Keep workspace backups outside the browser.',
      'Activation communicates with the licensing service. PDF export deliberately sends the public client-document fields to the protected rendering service; private hours, costs, margins, notes and comparisons are excluded.',
      'Password-protected workspace backups encrypt the exported copy. Optional plain JSON backups contain readable records. Clearing browser storage removes local work. Use Settings & backup to export, restore or delete your workspace deliberately.',
    ],
  },
  terms: {
    title: 'License and service information',
    paragraphs: [
      'Individual costs $49 once for one activated browser/device. Agency costs $99 once for five activated browsers/devices. Both plans have identical paid features and lifetime access.',
      'Agency devices keep independent local workspaces. Backups transfer your records deliberately; a backup does not grant a paid activation. You can release the current browser without deleting local projects.',
      'A workspace save or JSON backup is limited to 10 MiB, including images and document history. Protected PDF export currently allows up to 100 new render jobs per activated device per UTC day and 500 per license per UTC day. The renderer runs at most two jobs at a time; when busy, retry shortly.',
      'Approvals and payments are manual records. Record real client agreement and money actually received; issued invoices preserve their recorded values. The workspace does not process payments or sign agreements for clients.',
      'Final seller policies and refund handling are provided by the seller at the configured checkout. Review those published terms before purchasing.',
    ],
  },
  dpa: {
    title: 'Data processing overview',
    paragraphs: [
      'The current workspace saves records on your device. It uses a licensing service for entitlement and a protected service for deliberate client-document PDF export.',
      'PDF requests use a bounded public schema and validated raster branding. Rendering blocks document scripts and remote resources. Workspace backups exclude license keys and activation cookies.',
      'A formal data processing agreement must be provided by the seller when applicable. This overview describes the current application data flow; it is not a signed agreement.',
    ],
  },
};

for (const dialog of [lifetime, information]) {
  dialog
    .querySelectorAll('[data-dialog-close]')
    .forEach((button) => button.addEventListener('click', () => closeDialog(dialog)));
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      closeDialog(dialog);
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('dialog-open');
    const visible = (element) =>
      element &&
      element.getClientRects().length &&
      !element.closest('[inert]') &&
      getComputedStyle(element).visibility !== 'hidden';
    const target = [
      opener,
      document.getElementById('menuBtn'),
      document.querySelector('.nav-cta [data-lifetime]'),
      document.getElementById('themeBtn'),
    ].find(visible);
    target?.focus({ preventScroll: true });
  });
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest?.('[data-lifetime]');
  if (trigger) {
    event.preventDefault();
    openDialog(lifetime, trigger);
    void updatePlans();
    return;
  }
  const informationTrigger = event.target.closest?.('[data-information]');
  if (informationTrigger && info[informationTrigger.dataset.information]) {
    event.preventDefault();
    const content = info[informationTrigger.dataset.information];
    document.getElementById('informationTitle').textContent = content.title;
    document.getElementById('informationContent').replaceChildren(
      ...content.paragraphs.map((text) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        return paragraph;
      }),
    );
    openDialog(information, informationTrigger);
  }
});

document.addEventListener('scopeledger:choose-license', (event) => {
  openDialog(lifetime, event.detail?.opener || document.getElementById('cmdkBtn'));
  void updatePlans();
});
document.documentElement.classList.add('site-ready');
