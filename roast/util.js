export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Terminal bell. Pass a count to ring it harder (the drop alarm rings several at
// once so it's clearly more urgent than the single ready chime).
export const beep = (n = 1) => process.stdout.write('\x07'.repeat(n));
