const WebSocket = require('ws');
let robot = null;
try { robot = require('robotjs'); } catch (e) { console.log('robotjs missing, run: npm install robotjs'); }
const { exec } = require('child_process');
const wss = new WebSocket.Server({ port: 8080 });
console.log('AKILI PC SERVER on :8080 - phone is controller, PC is controlled');
wss.on('connection', (sock) => {
  console.log('Phone connected');
  sock.on('message', (raw) => {
    try {
      const d = JSON.parse(raw.toString());
      if (!robot) { sock.send(JSON.stringify({ status: 'no-robot', action: d.action })); return; }
      if (d.action === 'moveMouse') robot.moveMouse(d.x | 0, d.y | 0);
      else if (d.action === 'click') robot.mouseClick();
      else if (d.action === 'doubleClick') robot.mouseClick('left', true);
      else if (d.action === 'type') robot.typeString(String(d.text || ''));
      else if (d.action === 'keyPress') robot.keyTap(String(d.key || 'enter'));
      else if (d.action === 'openApp') {
        const app = String(d.name || '');
        const cmd = process.platform === 'win32' ? ('start "" "' + app + '"') : ('open -a "' + app + '"');
        exec(cmd);
      }
      sock.send(JSON.stringify({ status: 'ok', action: d.action }));
    } catch (e) { sock.send(JSON.stringify({ status: 'error' })); }
  });
});
