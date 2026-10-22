// Runs the real setup in apps-script/Code.gs against the fake Sheets runtime and dumps the
// resulting tabs to JSON. scripts/build-template.py turns that into sheets-template/*.xlsx.
const { loadGas } = require('../tests/fake-gas');
const g = loadGas();
g.ctx.setupFloraSheet();
const out = {};
for (const name of ['Catalog', 'Bookings', 'Booking Items', 'Blocked Dates', 'Settings']) {
  out[name] = g.sheets[name].cells.map((r) => (r || []).map((v) => (v === undefined ? '' : v)));
}
process.stdout.write(JSON.stringify(out));
