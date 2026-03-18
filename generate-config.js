require('dotenv').config();
const fs = require('fs');

const config = `window.APP_CONFIG = {
  SUPABASE_URL: '${process.env.SUPABASE_URL || ""}',
  SUPABASE_KEY: '${process.env.SUPABASE_KEY || ""}'
};`;

fs.writeFileSync('config.js', config);
console.log('✅ Generated config.js from environment variables.');
