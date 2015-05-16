var readTorrent = require('read-torrent'),
  bodyParser = require('body-parser'),
  tempDir = require('os').tmpdir(),
  peerflix = require('peerflix'),
  uuid = require('node-uuid'),
  app = require('express')(),
  https = require('https'),
  omx = require('omxcontrol'),
  path = require('path'),
  fs = require('fs'),
  rmdir = require('rimraf'),
  sys = require('sys'),
  exec = require('child_process').exec,
  ps = require('ps-node'),
  running = require('is-running'),
  engine;

process.on('uncaughtException', function(err) {
  console.log('uncaught exception: ' + err);
});

var PORT = process.argv[2] || 9090;

var mappings = {
  '/pause': 'pause',
  '/speedup': 'increaseSpeed',
  '/speeddown': 'decreaseSpeed',
  '/nextaudio': 'nextAudioStream',
  '/prevaudio': 'previousAudioStream',
  '/nextsubtitle': 'nextSubtitleStream',
  '/prevsubtitle': 'previousSubtitleStream',
  '/togglesubtitle': 'toggleSubtitles',
  '/volumeup': 'increaseVolume',
  '/volumedown': 'decreaseVolume',
  '/forward': 'seekForward',
  '/backward': 'seekBackward',
  '/fastforward': 'seekFastForward',
  '/fastbackward': 'seekFastBackward'
};

app.use(bodyParser());

var stopit = function() {
  if (!engine) return;
  console.log('stopping..');
  engine.destroy();
  engine = null;
};

var createTempFilename = function() {
  return path.join(tempDir, 'torrentcast_' + uuid.v4());
};

var clearTempFiles = function() {
  fs.readdir(tempDir, function(err, files) {
    if (err) return;
    files.forEach(function(file) {
      if (file.substr(0, 11) === 'torrentcast') {
        rmdir(path.join(tempDir, file), function(error){
          if (error) console.log('error');
          else console.log('removed temp folder');
        });
      }
    });
  });
};

app.post('/stream', function(req, res) {
  if(!req.body.url) return res.send(400, {error: 'stream url missing'});
  console.log('starting stream');
  stopit();
  omx.quit();
  omx.start(req.body.url);
});

app.post('/play', function(req, res) {
  console.log('in play');
  if (!req.body.url) return res.send(400, { error: 'torrent url missung' });
  readTorrent(req.body.url, function(err, torrent) {
    if (err) return res.send(400, { error: 'torrent link could not be parsed' });
    stopit();
    clearTempFiles();
    omx.quit();

    engine = peerflix(torrent, {
      connections: 100,
      path: createTempFilename(),
      buffer: (1.5 * 1024 * 1024).toString()
    });

    engine.server.on('listening', function() {
      console.log('engine started.');
      res.send(200);
    });
    var parts = 0;
    var started = false;
    engine.on('download', function(index, buffer) {
      parts++;
      console.log(parts + ': finished a part: ' + index);
      if(parts > 5 && !started) {
        started = true;
        console.log('starting omx player.');
        omx.quit();
        omx.start('http://127.0.0.1:' + engine.server.address().port + '/');
      }
      var omx_playing = false;
      if(started) {
        ps.lookup({command: 'omxplayer'}, function(err, results) {
          results.forEach(function(proccess) {
            if(process) {
              omx_playing = true;
            }
          });
          if(!omx_playing) {
            omx.quit();
            console.log('restarting omx player.');
            omx.start('http://127.0.0.1:' + engine.server.address().port + '/');
          }
        });
      }
    });
  });
});

app.post('/stop', function(req, res) {
  stopit();
  res.send(200);
});

for (var route in mappings) {
  (function(method) {
    app.post(route, function(req, res) {
      console.log('sending '+method);
      omx[method]();
      res.send(200);
    });
  })(mappings[route]);
}

options = {
  key: fs.readFileSync('/home/pi/pistream/raspi/key.pem'),
  cert: fs.readFileSync('/home/pi/pistream/raspi/server.crt')
};

https.createServer(options, app).listen(PORT);
console.log('server started.');

module.exports = function() {
  console.log('torrentcast running on port', PORT);
  app.listen(PORT);
};
