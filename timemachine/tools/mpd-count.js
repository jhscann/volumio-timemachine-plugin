'use strict';

var net = require('net');
var paths = (process.argv[2] || 'NAS/NAS/Flac,NAS/NAS/Vinyl').split(',').map(function (s) { return s.trim(); }).filter(Boolean);

function mpdQuote(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function request(command) {
  return new Promise(function (resolve, reject) {
    var socket = net.createConnection(6600, '127.0.0.1');
    var buffer = '';
    var sent = false;
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      socket.destroy();
      reject(new Error('timeout'));
    }, 600000);

    function finish(err, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch (e) {}
      if (err) reject(err);
      else resolve(result);
    }

    socket.on('data', function (chunk) {
      buffer += chunk.toString('utf8');
      if (!sent && buffer.indexOf('OK MPD') === 0) {
        sent = true;
        socket.write(command + '\n');
      }
      var lines = buffer.split(/\r?\n/);
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('ACK ') === 0) return finish(new Error(lines[i]));
        if (sent && lines[i] === 'OK') {
          socket.write('close\n');
          return finish(null, buffer);
        }
      }
    });
    socket.on('error', finish);
  });
}

(async function () {
  for (var i = 0; i < paths.length; i++) {
    var p = paths[i];
    var out = await request('listallinfo ' + mpdQuote(p));
    var files = out.split(/\r?\n/).filter(function (l) { return l.indexOf('file: ') === 0; });
    console.log(p + ': ' + files.length + ' file records, ' + Buffer.byteLength(out, 'utf8') + ' bytes');
    console.log('First file:', files[0] || '(none)');
    console.log('Last file:', files[files.length - 1] || '(none)');
  }
})().catch(function (e) {
  console.error(e.stack || e.message);
  process.exit(1);
});
