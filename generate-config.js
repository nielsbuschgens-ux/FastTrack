require('dotenv').config();
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const demoMode = !supabaseUrl || !supabaseKey;

if (!fs.existsSync('public')) {
    fs.mkdirSync('public', { recursive: true });
}

const config = `window.APP_CONFIG = {
  DEMO_MODE: ${demoMode},
  SUPABASE_URL: '${supabaseUrl}',
  SUPABASE_KEY: '${supabaseKey}'
};`;

fs.writeFileSync(path.join('public', 'config.js'), config);
console.log(demoMode ? '✅ Demo mode — config.js generated (no Supabase).' : '✅ Supabase config.js generated.');

const filesToCopy = ['index.html', 'app.js', 'styles.css'];
filesToCopy.forEach(file => {
    if (fs.existsSync(file)) {
        fs.copyFileSync(file, path.join('public', file));
        console.log(`✅ Copied ${file} to public folder.`);
    }
});
