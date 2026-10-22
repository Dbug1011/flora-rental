// Copies shared/booking-core.js to apps-script/BookingCore.gs so the website and the
// Apps Script booking service always run the same rules. `npm run sync:gas -- --check` fails if they differ.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'shared', 'booking-core.js');
const dest = path.join(__dirname, '..', 'apps-script', 'BookingCore.gs');
const header = '// GENERATED from shared/booking-core.js by `npm run sync:gas`. Do not edit here.\n';
const content = header + fs.readFileSync(src, 'utf8');

if (process.argv.includes('--check')) {
  const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  if (current !== content) {
    console.error('apps-script/BookingCore.gs is out of date. Run: npm run sync:gas');
    process.exit(1);
  }
  console.log('BookingCore.gs is in sync.');
} else {
  fs.writeFileSync(dest, content);
  console.log('Wrote', path.relative(process.cwd(), dest));
}
