import { expect, test } from '@playwright/test';

test('homepage accepts honest feedback without publishing unverified reviews', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/home/');

  const section = page.locator('#reviews');
  await section.scrollIntoViewIfNeeded();
  await expect(
    section.getByRole('heading', { name: 'Your experience belongs here.' }),
  ).toBeVisible();
  await expect(section).toContainText('There are no published customer reviews yet.');
  await expect(section).toContainText('prepares an email draft to Margvant support');
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

  const name = section.getByLabel('Your name (optional)');
  const feedback = section.getByLabel('Your review or feedback');
  const submit = section.getByRole('button', { name: 'Write a review' });
  const status = section.getByRole('status');

  await submit.click();
  await expect(status).toHaveText('Nothing is published unless you choose to share it with us.');
  await expect(feedback).toBeFocused();

  await name.fill('A Margvant user');
  await feedback.fill('The workflow helped me review a scope change more clearly.');
  await submit.click();
  await expect(status).toHaveText(
    'Your draft is ready. Open it in your email app, review it and press Send when you are ready.',
  );
  const draft = section.getByRole('link', { name: 'Open email draft' });
  await expect(draft).toBeVisible();
  const uri = new URL((await draft.getAttribute('href'))!);
  expect(uri.protocol).toBe('mailto:');
  expect(uri.pathname).toBe('support@scopeledger.site');
  expect(uri.searchParams.get('subject')).toBe('Margvant feedback');
  expect(uri.searchParams.get('body')).toBe(
    'Name: A Margvant user\n\nThe workflow helped me review a scope change more clearly.',
  );
});
