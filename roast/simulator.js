// A minimal fake of the Kaleido serial protocol so the whole controller can be
// exercised end-to-end without hardware. Models a coarse thermal response:
// auto-PID drives BT to the setpoint, the manual burner integrates BT upward,
// and the cooling fan pulls BT back toward ambient. Heating requires HS=1.

export class FakePort {
  constructor() {
    this.isOpen = true;
    this._closeCb = null;
    this._dataCb = null;
    this._last = Date.now();
    this.m = {
      sid: 1,
      BT: 22,
      ET: 24,
      AT: 22,
      TS: 0,
      HP: 0,
      FC: 0,
      RC: 0,
      AH: 0,
      HS: 0,
      CS: 0,
    };
  }

  on(ev, cb) {
    if (ev === 'close') this._closeCb = cb;
    return this;
  }

  // The real flow pipes bytes through a ReadlineParser; we already emit whole
  // lines, so just register the data callback and feed it directly.
  pipe() {
    return {
      on: (ev, cb) => {
        if (ev === 'data') this._dataCb = cb;
      },
    };
  }

  _reply(line) {
    if (this._dataCb) setTimeout(() => this._dataCb(line), 5);
  }

  _advance() {
    const now = Date.now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 5) dt = 5; // ignore long stalls
    const m = this.m;
    // HS is the master heater switch (commanded by the controller). The burner
    // only fires when HS=1, matching real hardware.
    if (m.CS) {
      // cooling fan dominates — pull toward ambient
      m.BT += (m.AT - m.BT) * Math.min(1, 0.3 * dt);
      m.HP = 0;
    } else if (m.AH && m.HS) {
      // auto-PID: report the PID burner duty in HP (as the real machine does)
      const err = m.TS - m.BT;
      m.HP = err > 30 ? 100 : err > 0 ? Math.max(8, Math.round(err * 3)) : 0;
      m.BT += (m.TS - m.BT) * Math.min(1, 0.22 * dt);
    } else if (m.HS) {
      // manual: burner (HP set by controller) integrates temp upward
      const rate = m.HP * 0.04 - m.FC * 0.005 - 0.05; // °C/s
      m.BT += rate * dt;
    } else {
      // heater off — drift slowly toward ambient
      m.BT += (m.AT - m.BT) * Math.min(1, 0.02 * dt);
      m.HP = 0;
    }
    m.BT += (Math.random() - 0.5) * 0.08; // probe noise
    m.ET = m.BT + (m.HS ? 10 : 3);
  }

  _state() {
    const m = this.m;
    return (
      `{${m.sid},BT:${m.BT.toFixed(1)},ET:${m.ET.toFixed(1)},` +
      `AT:${m.AT.toFixed(1)},TS:${m.TS.toFixed(1)},HP:${m.HP},FC:${m.FC},` +
      `RC:${m.RC},AH:${m.AH},HS:${m.HS},CS:${m.CS}}`
    );
  }

  write(msg) {
    const match = msg.trim().match(/^\{\[(\w+)(?:\s+(.+))?\]\}$/);
    if (!match) return;
    const tag = match[1];
    const val = match[2];
    const m = this.m;
    if (tag === 'PI') return this._reply(`{${m.sid}}`);
    if (tag === 'TU') return this._reply(`{${m.sid},TU:${val}}`);
    if (tag === 'SC' || tag === 'CL') return this._reply(`{${m.sid},SN:SIM}`);
    if (tag === 'RD') {
      this._advance();
      return this._reply(this._state());
    }
    if (tag === 'TS') {
      m.TS = parseFloat(val) || 0;
      return this._reply(`{${m.sid},TS:${m.TS.toFixed(1)}}`);
    }
    if (['HP', 'FC', 'RC', 'AH', 'HS', 'CS'].includes(tag)) {
      const n = Math.round(parseFloat(val)) || 0;
      // Simulate the charge turnaround: dropping out of auto-PID = beans in.
      if (tag === 'AH' && m.AH === 1 && n === 0 && m.BT > 100)
        m.BT = Math.max(m.AT + 5, m.BT - 60);
      m[tag] = n;
      return this._reply(`{${m.sid},${tag}:${n}}`);
    }
  }

  close() {
    this.isOpen = false;
    this._closeCb?.();
  }
}
