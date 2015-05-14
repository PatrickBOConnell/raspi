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

var stopit = function() {
  if (!engine) return;
  console.log('stopping..');
  engine.destroy();
  engine = null;
  if(omx) omx.quit();
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

app.post('/play', function(req, res) {
  console.log('in play');
  if (!req.body.url) return res.send(400, { error: 'torrent url missung' });
  readTorrent(req.body.url, function(err, torrent) {
    if (err) return res.send(400, { error: 'torrent link could not be parsed' });
    if (engine) stopit();
    clearTempFiles();

    engine = peerflix(torrent, {
      connections: 100,
      path: createTempFilename(),
      buffer: (1.5 * 1024 * 1024).toString()
    });

    engine.server.on('listening', function() {
      console.log('listening emitted.');
      omx.start('http://127.0.0.1:' + engine.server.address().port + '/', function restart(){
        console.log('restarting...');
        omx.start('http://127.0.0.1:' + engine.server.address().port + '/', restart);
      });
      console.log('engine started.');
      res.send(200);
    });
    // engine.on('download', function(index, buffer) {
    //   console.log('finished a part: ' + index);
    //   var omx_playing = false;
    //   ps.lookup({command: 'omxplayer'}, function(err, results) {
    //     results.forEach(function(proccess) {
    //       if(process) {
    //         omx_playing = true;
    //       }
    //     });
    //     if(!omx_playing) {
    //       omx.quit();
    //       omx.start('http://127.0.0.1:' + engine.server.address().port + '/');
    //       console.log('starting omx player.');
    //     }
    //   });
    // });
  });
});

app.post('/stop', function(req, res) {
  stopit();
  res.send(200);
});

app.post('/pause', function(req, res) {
  if(omx) omx.pause();
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
  key: fs.readFileSync('/home/pi/pistream/raspi/key.pem'),
  cert: fs.readFileSync('/home/pi/pistream/raspi/server.crt')
};

https.createServer(options, app).listen(PORT);
console.log('server started.');

module.exports = function() {
  console.log('torrentcast running on port', PORT);
  app.listen(PORT);
};
