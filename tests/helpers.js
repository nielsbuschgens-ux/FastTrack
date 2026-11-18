const { expect } = require('@playwright/test');

// Forceer demo-modus: de app krijgt een nep-config, dus tests raken nooit de echte Supabase.
async function startDemo(page, name = 'Tester') {
    await page.route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'window.APP_CONFIG = { DEMO_MODE: true };'
    }));

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.locator('#name-input').fill(name);
    await page.locator('#login-btn').click();
    await expect(page.locator('#screen-launch')).toHaveClass(/active/);
    return errors;
}

// Dag (split) op het startscherm openen
async function openDay(page, day) {
    await page.locator('.split-btn', { has: page.locator('h2', { hasText: new RegExp(`^${day}$`, 'i') }) }).click();
    await expect(page.locator('#screen-workout')).toHaveClass(/active/);
}

// Oefening in de lijst openen
async function openExercise(page, name) {
    await page.locator('.swipe-content', { hasText: name }).first().click();
    await expect(page.locator('#screen-log')).toHaveClass(/active/);
}

module.exports = { startDemo, openDay, openExercise };
