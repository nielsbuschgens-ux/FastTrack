// Playwright: test de app in demo-modus (geen Supabase), in telefoonformaat.
// Draaien: npm test   ·   met zichtbare browser: npm run test:headed
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30_000,
    fullyParallel: true,
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }]],
    use: {
        baseURL: `http://localhost:${PORT}`,
        channel: 'chrome',          // gebruikt de geïnstalleerde Chrome, geen extra download
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        // Meekijken: SLOWMO=500 vertraagt elke klik met 500 ms
        launchOptions: { slowMo: Number(process.env.SLOWMO) || 0 }
    },
    projects: [
        { name: 'telefoon', use: { ...devices['Pixel 7'], channel: 'chrome' } }
    ],
    webServer: {
        command: `npx --yes serve . -l ${PORT} --no-clipboard`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 60_000
    },
    outputDir: 'test-results/artifacts'
});
