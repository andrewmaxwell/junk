// Emergency stop, for when the app isn't there to do it (crashed, hung, or
// killed). The M1 LITE has no panel: this USB connection is the only way to
// turn the burner off short of unplugging it.
//
//   node kaleido/server/stop.js         heater off; air and drum keep running
//                                      so the machine (and any beans) cool
//   node kaleido/server/stop.js --all   everything off (once it's cool)
//
// If the app is still running, it holds the port, and this can't connect:
// use the app's STOP button, or quit the app (Ctrl-C twice also turns the
// heater off) and run this again.

import {createClock} from './clock.js';
import {Machine} from './machine.js';
import {SerialTransport} from './port.js';

const ALL = process.argv.includes('--all');
const clock = createClock();
const machine = new Machine({
  clock,
  openTransport: () => new SerialTransport().open(),
});
let lastError = null;
machine.on('error', (err) => (lastError = err.message));
machine.run();

const deadline = Date.now() + 15_000;
while (!machine.connected && Date.now() < deadline) await clock.sleep(200);
if (!machine.connected) {
  console.log(`Couldn't connect to the roaster: ${lastError ?? 'no answer'}`);
  console.log('If the app is running, use its STOP button or quit it first.');
  console.log('Last resort: unplug the roaster.');
  process.exit(1);
}

machine.set(
  ALL
    ? {HS: 0, AH: 0, HP: 0, FC: 0, RC: 0, CS: 0}
    : {HS: 0, AH: 0, HP: 0, FC: 100, RC: 90},
);
while (!machine.settled() && Date.now() < deadline) await clock.sleep(200);
const s = machine.state;
console.log(
  machine.settled()
    ? `Heater off${ALL ? ', everything off' : '; air 100% and drum 90% running to cool'}. BT ${s.BT}.`
    : `Sent, but not all confirmed: ${JSON.stringify(s)}`,
);
if (!ALL && s.BT > 60)
  console.log(
    'Once BT is under 60, run with --all to turn the air and drum off.',
  );
await machine.stop();
process.exit(machine.settled() ? 0 : 1);
