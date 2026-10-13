import { expect, test } from '@playwright/test';

test('homepage keeps review status honest and collects private waitlist details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/home/');

  const heroNote = page.locator('.hero-review-proof');
  await expect(heroNote).toBeVisible();
  await expect(heroNote).toContainText('Customer reviews');
  await expect(heroNote).toContainText('No customer reviews published yet.');
  await expect(heroNote).toContainText('Feedback is only shared with permission.');
  await expect(heroNote).not.toContainText(/4\.9|verified|stars|rated/i);

  const section = page.locator('#reviews');
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole('heading', { name: 'Join the Margvant waitlist.' })).toBeVisible();
  await expect(section).toContainText('There are no published customer reviews yet.');
  await expect(section).not.toContainText(/verified|rated|stars|customer endorsement/i);

  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await section.evaluate((element) => ({
      pageScroll: document.documentElement.scrollWidth,
      right: element.getBoundingClientRect().right,
    }));
    expect(layout.pageScroll).toBeLessThanOrEqual(width);
    expect(layout.right).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await section.scrollIntoViewIfNeeded();

  const name = section.locator('input[name="name"]');
  const email = section.locator('input[name="email"]');
  const feedback = section.locator('textarea[name="feedback"]');
  const consent = section.locator('input[name="privacyAccepted"]');
  const submit = section.getByRole('button', { name: 'Join the waitlist', exact: true });
  await expect(name).toHaveAttribute('required', '');
  await expect(email).toHaveAttribute('type', 'email');
  await expect(email).toHaveAttribute('required', '');
  await expect(feedback).toBeVisible();
  await expect(feedback).not.toHaveAttribute('required', '');
  await expect(consent).toHaveAttribute('required', '');
  await expect(section.getByRole('button', { name: /write a review|open email draft/i })).toHaveCount(0);
  await expect(section.getByRole('link', { name: 'Open email draft' })).toHaveCount(0);
  await expect(section.getByRole('status')).toHaveText('Your details stay private and are not published.');
});
