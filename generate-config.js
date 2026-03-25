require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Ensure public directory exists
if (!fs.existsSync('public')) {
    fs.mkdirSync('public', { recursive: true });
}

const config = `window.APP_CONFIG = {
  SUPABASE_URL: '${process.env.SUPABASE_URL || ""}',
  SUPABASE_KEY: '${process.env.SUPABASE_KEY || ""}'
};`;

fs.writeFileSync(path.join('public', 'config.js'), config);
console.log('✅ Generated config.js in public folder.');

// Copy necessary files to public directory
const filesToCopy = ['index.html', 'app.js', 'styles.css'];
filesToCopy.forEach(file => {
    if (fs.existsSync(file)) {
        fs.copyFileSync(file, path.join('public', file));
        console.log(`✅ Copied ${file} to public folder.`);
    }
});
