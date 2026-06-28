import { test, expect } from '@playwright/test';

test('home redirects to the current event', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/tour-de-france-2026/);
});

test('index lists all 21 stages', async ({ page }) => {
	await page.goto('/tour-de-france-2026/');
	const cards = page.locator('[data-stage]');
	await expect(cards).toHaveCount(21);
});

test('stage page renders key data', async ({ page }) => {
	await page.goto('/tour-de-france-2026/stage-20/');
	await expect(page.locator('h1')).toContainText('Alpe d');
	// Queen stage has climbs including the Galibier (scope to the list — the name can also
	// appear as a profile marker label).
	await expect(page.locator('.climbs').getByText('Col du Galibier')).toBeVisible();
});

test('prev/next navigation works', async ({ page }) => {
	await page.goto('/tour-de-france-2026/stage-2/');
	await page.getByRole('link', { name: /Stage 3/ }).click();
	await expect(page).toHaveURL(/stage-3/);
});

test('reduced motion is respected (no crash with View Transitions)', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/tour-de-france-2026/');
	await page.locator('[data-stage="1"]').click();
	await expect(page).toHaveURL(/stage-1/);
});

test('rest days render in the right timeline positions', async ({ page }) => {
	await page.goto('/tour-de-france-2026/');
	await expect(page.locator('[data-rest]')).toHaveCount(2);
	const y = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y;
	// Rest day 1 sits between stage 9 and 10; rest day 2 between stage 15 and 16.
	expect(await y('[data-stage="9"]')).toBeLessThan(await y('[data-rest="2026-07-13"]'));
	expect(await y('[data-rest="2026-07-13"]')).toBeLessThan(await y('[data-stage="10"]'));
	expect(await y('[data-stage="15"]')).toBeLessThan(await y('[data-rest="2026-07-20"]'));
	expect(await y('[data-rest="2026-07-20"]')).toBeLessThan(await y('[data-stage="16"]'));
});

test('rest day gets the today treatment on the rest day', async ({ page }) => {
	await page.goto('/tour-de-france-2026/?date=2026-07-13');
	await expect(page.locator('[data-rest="2026-07-13"]')).toHaveClass(/today/);
});

test('GPX climbs are wired in: stage 5 shows its Cat 3 (the closed coverage gap)', async ({
	page
}) => {
	await page.goto('/tour-de-france-2026/stage-5/');
	// Previously rendered "Climbs: —" because stage.climbs (hand-seeded) was empty.
	await expect(page.locator('.climbs').getByText('Côte de Baleix')).toBeVisible();
});

test('repeated circuit climbs collapse with a ×N badge (Montjuïc on stage 2)', async ({ page }) => {
	await page.goto('/tour-de-france-2026/stage-2/');
	const climb = page.locator('.climb', { hasText: 'Montjuïc' });
	await expect(climb).toHaveCount(1);
	await expect(climb.locator('.climb-laps')).toHaveText('×3');
});

test('a climb with no GPX komstart gets a real length via terrain walk-back (Grand Ballon)', async ({
	page
}) => {
	await page.goto('/tour-de-france-2026/stage-14/');
	const climb = page.locator('.climb', { hasText: 'Grand Ballon' });
	await expect(climb).toBeVisible();
	// Resolved by walk-back to ~21.7km — no longer "length n/a", never "null".
	await expect(climb).toContainText('km');
	await expect(climb).not.toContainText('n/a');
	await expect(climb).not.toContainText('null');
});

test('rest day shows its officially-sourced location', async ({ page }) => {
	await page.goto('/tour-de-france-2026/');
	await expect(page.locator('[data-rest="2026-07-13"]')).toContainText('Cantal');
	await expect(page.locator('[data-rest="2026-07-20"]')).toContainText('Haute-Savoie');
});

test('breadcrumb stage selector jumps to another stage (real route change)', async ({ page }) => {
	await page.goto('/tour-de-france-2026/stage-12/');
	const trigger = page.getByRole('button', { name: /Jump to another stage/ });
	await expect(trigger).toBeVisible();
	await trigger.click();
	// Menu lists all stages; pick stage 18.
	await page.getByRole('menuitem', { name: /Stage 18/ }).click();
	await expect(page).toHaveURL(/stage-18/);
	// Trigger now reflects the new current stage.
	await expect(page.getByRole('button', { name: /Current: stage 18/ })).toBeVisible();
});

test('stage selector is keyboard accessible and closes on Escape', async ({ page }) => {
	await page.goto('/tour-de-france-2026/stage-3/');
	const trigger = page.getByRole('button', { name: /Jump to another stage/ });
	await trigger.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('menu')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('menu')).toHaveCount(0);
});

test('finish-zoom hero classifies by geometry (C on stage 20, flat on stage 7)', async ({ page }) => {
	// Stage 20 = Alpe d'Huez via Sarenne: decisive climb 14km out + run-in → climb-runin (C).
	await page.goto('/tour-de-france-2026/stage-20/');
	const fz20 = page.locator('.finish-zoom');
	await expect(fz20).toContainText('The final climb & run-in');
	await expect(fz20.getByText('Col de Sarenne')).toBeVisible();
	// Stage 7 = Bordeaux: flat finish (D) — the technical run-in, not a banded climb.
	await page.goto('/tour-de-france-2026/stage-7/');
	await expect(page.locator('.finish-zoom')).toContainText('flat run-in');
});

test('route map renders when scrolled into view', async ({ page }) => {
	await page.goto('/tour-de-france-2026/stage-20/');
	// Map container is server-rendered.
	await expect(page.locator('.map')).toBeVisible();
	// Scrolling the Route section into view lazily imports MapLibre, which constructs
	// the canvas on map creation (before tiles load — no network needed for this).
	await page.getByText('Route', { exact: true }).scrollIntoViewIfNeeded();
	await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 20000 });
});

test('route map updates when navigating between stages', async ({ page }) => {
	await page.goto('/tour-de-france-2026/stage-6/');
	await page.getByText('Route', { exact: true }).scrollIntoViewIfNeeded();
	await page.waitForSelector('.maplibregl-canvas', { timeout: 20000 });
	// Wait until the map has rendered stage 6's route.
	await page.waitForFunction(() => !!document.querySelector('.map')?.getAttribute('data-route-start'));
	const start6 = await page.locator('.map').getAttribute('data-route-start');
	// Navigate to stage 7 via the pager.
	await page.getByRole('link', { name: /Stage 7/ }).click();
	await expect(page).toHaveURL(/stage-7/);
	// The (reused) map must re-render to stage 7's track, not keep stage 6's.
	await page.waitForFunction(
		(prev) => {
			const v = document.querySelector('.map')?.getAttribute('data-route-start');
			return !!v && v !== prev;
		},
		start6,
		{ timeout: 20000 }
	);
	expect(await page.locator('.map').getAttribute('data-route-start')).not.toBe(start6);
});
