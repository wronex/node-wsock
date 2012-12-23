/* 
 * Benchmark test server and client as described by 
 * https://github.com/kazuyukitanimura/websocketBinaryTransferBenchmark
 */

/**
 * Module dependencies.
 */
var fs = require('fs');
var WebSocket = require('../lib/websocket');

/**
 * ARGV Set
 */
var Protocol = process.argv[2] ? 'https': 'http' // the first argument
if (Protocol === 'https') {
  var ServerName = 'server';
  var options = {
    key: fs.readFileSync(ServerName + '.key'),
    cert: fs.readFileSync(ServerName + '.cert')
  };
}

//var app = require(Protocol).createServer((Protocol === 'https') ? options: undefined);
//app.listen(8082);

var wsServer = WebSocket.createServer();

wsServer.on('connect', function(connection) {
	connection.frameMaxLength = 0x40000000; // 1GiB max frame size
	connection.messageMaxLength = 0x40000000; // 1GiB max message size

	connection.on('data', function(data, isBinary) {
		connection.send(data);
	});
});

wsServer.listen(8082);