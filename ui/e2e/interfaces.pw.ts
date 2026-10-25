import { test, expect, Page } from '@playwright/test';

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('party-demo:v1')!));
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('desktop themes, full event tools, account and text mode', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/clubhouse/');
  await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
  for (const name of ['Gazette', 'Club House']) {
    await page.getByRole('radio', { name, exact: true }).click();
    await expect(page.getByRole('radio', { name, exact: true })).toHaveAttribute('aria-checked', 'true');
    await noOverflow(page);
    await page.screenshot({ animations: 'disabled', path: info.outputPath(name + '.png') });
  }
  const s = await state(page); const e = s.events.find((e: any) => e.hosts.includes(s.session));
  await page.goto('/clubhouse/manage/events/' + e.id);
  await expect(page.getByRole('button', { name: 'Delete event permanently' })).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete event permanently' }).click();
  expect((await state(page)).events.some((x: any) => x.id === e.id)).toBe(true);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete event permanently' }).click();
  await expect(page).toHaveURL(/groups/);
  expect((await state(page)).events.some((x: any) => x.id === e.id)).toBe(false);
  expect((await state(page)).rsvps.some((x: any) => x.event === e.id)).toBe(false);
  await page.goto('/clubhouse/me');
  await expect(page.getByRole('heading', { name: /profile|account|about you/i }).first()).toBeVisible();
  await page.goto('/clubhouse/text');
  await expect(page.locator('ch-console')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const app of ['clubhouse', 'deck']) test(`${app}: phone event regular attendance and profile history`, async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/' + app + '/');
  await expect.poll(async () => !!(await state(page))).toBe(true);
  const s = await state(page); const e = s.events.find((e: any) => e.series);
  const prefix = app === 'clubhouse' ? '/clubhouse/m' : '/deck';
  await page.goto(prefix + '/e/' + e.id);
  const regular = page.getByRole('button', { name: /Become a regular|Stop being a regular/ });
  await expect(regular).toBeVisible();
  const before = await regular.innerText(); await regular.click();
  await expect(regular).not.toHaveText(before);
  await noOverflow(page);
  await page.screenshot({ animations: 'disabled', path: info.outputPath(app + '-event.png'), fullPage: true });
  const g = s.groups.find((g: any) => g.id === e.group);
  await page.goto(prefix + '/groups/' + g.slug + '/members/' + s.session);
  await expect(page.getByRole('heading').first()).toBeVisible();
  await noOverflow(page);
});

test('chat regular toggle and linked forms preserve the conversation', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chat/');
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  const s = await state(page); const e = s.events.find((e: any) => e.series);
  const send = async (message: string) => {
    await page.getByRole('textbox', { name: 'Message' }).fill(message);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
  };
  await send('e' + e.id);
  await expect(page.getByRole('button', { name: 'Become a regular', exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Become a regular', exact: true }).last().click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(async () => (await state(page)).series.find((x: any) => x.id === e.series).regulars.includes(s.session)).toBe(true);
  await noOverflow(page);
  expect((await page.locator('.composer').boundingBox())!.y + (await page.locator('.composer').boundingBox())!.height).toBeLessThanOrEqual(845);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('chat-phone.png'), fullPage: true });
  await send('me');
  await page.getByRole('button', { name: /account.*household|full account/i }).last().click();
  await expect(page).toHaveURL(/account/);
  await page.getByRole('link', { name: 'Back to chat' }).click();
  await expect(page.getByText('Back to the conversation.')).toBeVisible();
});

for (const app of ['gazette', 'terminal', 'classic']) test(`${app}: shared account and event editor routes`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/' + app + '/');
  await expect.poll(async () => !!(await state(page))).toBe(true);
  const s = await state(page); const e = s.events.find((e: any) => e.hosts.includes(s.session));
  await page.goto('/' + app + '/events/' + e.id + '/edit');
  await expect(page.getByRole('heading', { name: /edit/i }).first()).toBeVisible();
  await page.goto('/' + app + (app === 'classic' ? '/me' : '/account'));
  await expect(page.getByRole('heading', { name: /profile|account|about you/i }).first()).toBeVisible();
  expect(errors).toEqual([]);
});


test('desktop creation context, biography space and existing-account invitations', async ({ page }) => {
  await page.goto('/clubhouse/new');
  await expect(page.getByRole('combobox', { name: 'Group', exact: true })).toHaveValue('0');
  const s = await state(page); const g = s.groups.find((g: any) => g.slug === 'maple-street-neighbours');
  await page.goto('/clubhouse/new?group=' + g.slug);
  await expect(page.getByRole('combobox', { name: 'Group', exact: true })).toHaveValue(String(g.id));
  await page.goto('/clubhouse/profile');
  const bio = page.getByRole('textbox', { name: 'About me', exact: true });
  await expect(bio).toBeVisible();
  expect((await bio.boundingBox())!.height).toBeGreaterThan(120);
  await page.goto('/clubhouse/groups/' + g.slug);
  await expect(page.locator('party-invite-panel')).toHaveCount(0);
  await page.goto('/clubhouse/groups/' + g.slug + '/invite');
  await expect(page.getByRole('heading', { name: 'Someone already here' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
  await expect(page.locator('#party-style-classic')).toHaveCount(1);
});

test('phone approves the named join request', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/clubhouse/m/groups/maple-street-neighbours');
  await page.getByRole('button', { name: 'Review request', exact: true }).click();
  await expect(page.getByText(/Approve Theo/)).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review request', exact: true })).toHaveCount(0);
});

test('embedded chat event actions and stylesheet load', async ({ page }, info) => {
  await page.goto('/clubhouse/');
  await page.getByRole('button', { name: /Ask the board/ }).click();
  const box = page.getByRole('textbox', { name: 'Message' });
  await expect(box).toBeEnabled();
  const s = await state(page); const e = s.events.find((e: any) => e.series);
  await box.fill('e' + e.id);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Become a regular', exact: true })).toBeVisible();
  await expect(page.locator('#party-style-chat')).toHaveCount(1);
  expect(await page.locator('.chat-panel main').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('embedded-chat.png') });
});
