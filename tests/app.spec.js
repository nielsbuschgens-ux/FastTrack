const { test, expect } = require('@playwright/test');
const { startDemo, openDay, openExercise } = require('./helpers');

test.describe('FastTrack', () => {
    test('inloggen toont startscherm met weekdoel en PPL', async ({ page }) => {
        const errors = await startDemo(page);
        await expect(page.locator('#week-goal')).toBeVisible();
        await expect(page.locator('#scheme-select')).toHaveValue('ppl');
        await expect(page.locator('.split-btn h2')).toHaveText(['Push', 'Pull', 'Legs']);
        expect(errors).toEqual([]);
    });

    test('set loggen met één tik, met progressievoorstel', async ({ page }) => {
        const errors = await startDemo(page);
        await openDay(page, 'Push');
        await openExercise(page, 'Bench Press');

        // Vorige keer 75 kg × 6 → voorstel +2,5 kg
        await expect(page.locator('#progress-banner')).toContainText('+2,5 kg');
        await expect(page.locator('#current-weight')).toHaveValue('77,5');

        await page.locator('#log-btn').click();
        await expect(page.locator('#today-sets .set-chip')).toHaveCount(1);
        await expect(page.locator('#log-btn-label')).toHaveText('Log set 2');
        await expect(page.locator('#rest-timer')).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('platen-modus: 2× 20 tikken = 80 kg', async ({ page }) => {
        await startDemo(page);
        await openDay(page, 'Legs');
        await openExercise(page, 'Squat');

        await page.locator('#mode-plates-btn').click();
        await expect(page.locator('#plate-loader')).toHaveClass(/suggested/);

        const plate20 = page.locator('.plate-buttons .p20');
        await plate20.click();
        await plate20.click();
        await expect(page.locator('#plate-total-kg')).toHaveText('80');
        await expect(page.locator('#plate-per-side')).toHaveText('40 kg per kant');

        await page.locator('#log-btn').click();
        await expect(page.locator('#today-sets .set-chip').first()).toContainText('80 kg');
    });

    test('schema wisselen naar spiergroep-split', async ({ page }) => {
        await startDemo(page);
        await page.locator('#scheme-select').selectOption('bro');
        await expect(page.locator('.split-btn h2')).toHaveText(['Borst', 'Rug', 'Benen', 'Schouders', 'Armen']);

        // Keuze blijft bewaard na herladen
        await page.reload();
        await expect(page.locator('#scheme-select')).toHaveValue('bro');
    });

    test('bestaande oefening op een tweede dag zetten deelt de geschiedenis', async ({ page }) => {
        await startDemo(page);
        page.on('dialog', d => d.accept());

        await openDay(page, 'Pull');
        await page.locator('#add-ex-btn').click();
        await page.locator('#new-ex-input').fill('Bench Press');
        await expect(page.locator('#new-ex-hint')).toContainText('Bestaat al bij Push');
        await page.locator('#add-ex-container .btn-primary').click();

        await expect(page.locator('.swipe-content', { hasText: 'Bench Press' })).toBeVisible();
        await openExercise(page, 'Bench Press');
        await expect(page.locator('#prev-section')).toBeVisible();   // geschiedenis van Push is er
    });

    test('onbekende oefening: spiergroep kiezen in het formulier', async ({ page }) => {
        await startDemo(page);
        await openDay(page, 'Push');
        await page.locator('#add-ex-btn').click();
        await page.locator('#new-ex-input').fill('Landmine thing');
        await expect(page.locator('#new-ex-hint')).toHaveText('Niet herkend — kies de spiergroep');
        await page.locator('#new-ex-primary').selectOption('schouder_voor');
        await page.locator('#new-ex-secondary').selectOption('triceps');
        await page.locator('#add-ex-container .btn-primary').click();

        await openExercise(page, 'Landmine thing');
        await expect(page.locator('#ex-muscles')).toContainText('Voorkant schouder · triceps');
    });

    test('feedback versturen', async ({ page }) => {
        await startDemo(page);
        await page.getByRole('button', { name: 'Feedback geven' }).click();
        await expect(page.locator('#feedback-sheet')).toBeVisible();
        await expect(page.locator('#feedback-send-btn')).toBeDisabled();   // leeg = niet versturen

        await page.getByRole('button', { name: '🐞 Bug' }).click();
        await page.locator('#feedback-text').fill('Timer trilt niet op mijn telefoon');

        // Focus op het tekstveld mag de app niet opzij laten schuiven
        const appScrollLeft = await page.evaluate(() => document.getElementById('app').scrollLeft);
        expect(appScrollLeft).toBe(0);
        await page.screenshot({ path: 'test-results/feedback.png' });
        await page.locator('#feedback-send-btn').click();

        await expect(page.locator('#feedback-sheet')).toBeHidden();
        await expect(page.locator('#toast-msg')).toContainText('Bedankt');

        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fasttrack_demo_feedback')));
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({ type: 'bug', message: 'Timer trilt niet op mijn telefoon' });
        expect(saved[0].context).toMatchObject({ screen: 'launch', scheme: 'ppl' });
    });

    test('progressiescherm toont lichaam en spiergroepen', async ({ page }) => {
        await startDemo(page);
        await page.locator('#nav-progress-btn').click();
        await expect(page.locator('.body-map svg')).toHaveCount(2);
        await expect(page.locator('.muscle-row')).toHaveCount(14);

        await page.locator('.bm[data-muscle="borst"]').first().click();
        await expect(page.locator('#body-info')).toContainText('Borst');
        await expect(page.locator('.muscle-row[data-muscle="borst"]')).toHaveAttribute('open', '');
    });
});
