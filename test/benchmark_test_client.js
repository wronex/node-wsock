/* 
 * Benchmark test server and client as described by 
 * https://github.com/kazuyukitanimura/websocketBinaryTransferBenchmark
 */

/**
 * Module dependencies.
 */
var fs = require('fs');
var crypto = require('crypto');

/**
 * ARGV Set
 */
var Size = process.argv[2] ? parseInt(process.argv[2].toString().trim()) : 1048576; // the first argument
var MaxIter = process.argv[3] ? parseInt(process.argv[3].toString().trim()) : 20; // the second argument
var Protocol = process.argv[4] ? 'wss': 'ws' // the third argument

/**
 * WevSocketClient connect
 */
//var ServerName = 'server.info';
var ServerName = 'localhost';
var PortN = 8082
var WebSocket = require('../lib/websocket');
var client = new WebSocket.connect({
  port: PortN,
  host: ServerName,
  frameMaxLength: 0x40000000, // 1GiB max frame size
  messageMaxLength: 0x40000000 // 1GiB max message size
});

/**
 * Error handler
 */
client.on('error', function(reason) {
  console.error('connection to the "' + ServerName + '" has broken, reason: [' + reason + ']');
});

client.on('open', function(connection) {
  var start = undefined;
  var totalTime = 0;
  var i = MaxIter;

  client.on('error', function(error) {
    console.log("Connection Error: " + error.toString());
  });

  /**
   * Download Event
   */
  client.on('data', function(message, isBinary) {
    var time = Date.now() - start;
    console.log('Data size: ' + Size + ', roudtrip time: ' + time + ' ms');
    totalTime += time;
    if (--i) {
      uploadStart(Size);
    } else {
      var ave = totalTime / MaxIter;
      console.log('Average roundtrip time: ' + ave + ' ms');

      /**
       * Transfer ratio: Size(Bytes) / (ave(ms) / 2(roundtrip)) * 1000 = (Bytes per Second)
       * (Bytes per Second) * 8 / 1024 / 1024= (Mbps)
       */
      console.log('Transfer ratio: ' + (Size / ave * 2000).toFixed(1) + '[Bytes per Second] = ' + (Size / ave * 0.0152587890625).toFixed(1) + '[Mbps]');
      process.exit(0);
    }
  });

  /**
   * Upload File
   */
  function uploadStart(size) {
    crypto.randomBytes(size, function(ex, buf) {
      if (ex) throw ex;
      start = Date.now();
      client.send(buf);
    });
  }

  uploadStart(Size);
});
