var readTorrent = require('read-torrent'),
  bodyParser = require('body-parser'),
  tempDir = require('os').tmpdir(),
  peerflix = require('peerflix'),
  uuid = require('node-uuid'),
  app = require('express')(),
  https = require('https'),
  omx = require('omxctrl'),
  path = require('path'),
  fs = require('fs'),
  sys = require('sys'),
  exec = require('child_process').exec,
  engine;

var STATES = ['PLAYING', 'PAUSED', 'IDLE'];
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

var stop = function() {
  if (!engine) return;
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
        fs.rmdir(path.join(tempDir, file));
      }
    });
  });
};

app.post('/play', function(req, res) {
  if (!req.body.url) return res.send(400, { error: 'torrent url missung' });
  readTorrent(req.body.url, function(err, torrent) {
    if (err) return res.send(400, { error: 'torrent link could not be parsed' });
    if (engine) stop();
    clearTempFiles();

    engine = peerflix(torrent, {
      connections: 100,
      path: createTempFilename(),
      buffer: (1.5 * 1024 * 1024).toString()
    });

    engine.server.on('listening', function() {
      //omx.play('http://127.0.0.1:' + engine.server.address().port + '/');
      vlc = exec('vlc http://127.0.0.1:' + engine.server.address().port + '/ --fullscreen', function(err, stdout, stderr){
        console.log('starting vlc..');
      });
      res.send(200);
    });
  });
});

app.post('/stop', function(req, res) {
  stop();
  res.send(200);
});

app.get('/state', function(req, res) {
  res.send(200, STATES[omx.getState()]);
});

for (var route in mappings) {
  (function(method) {
    app.post(route, function(req, res) {
      omx[method]();
      res.send(200);
    });
  })(mappings[route]);
}

options = {
  key: fs.readFileSync('/home/patrick/Programming/Projects/pistream/key.pem'),
  cert: fs.readFileSync('/home/patrick/Programming/Projects/pistream/server.crt')
};

https.createServer(options, app).listen(PORT);

module.exports = function() {
  console.log('torrentcast running on port', PORT);
  app.listen(PORT);
};