var websocket = require('../lib/websocket.js');

// Create a new WebSocket server.
var server = websocket.createServer();

server.on('connect', function(connection) {
	console.log('WebSocket connected:', connection.socket.remoteAddress, '(' + server.connections, '/', server.maxConnections + ')');

	connection.on('data', function(data, isBinary) {
		//console.log('Recieved:', data.length > 64 ? data.length + ' bytes' : data);
		connection.send(data);
		//console.log('Sent:', data.length > 64 ? data.length + ' bytes' : data);
	});
	
	connection.on('close', function() {
		console.log('WebSocket closed', '(' + server.connections, '/', server.maxConnections + ')');
	});
	
	connection.on('error', function(ex) {
		console.error('WebSocket error:', ex);
		throw ex;
	});
});

server.on('error', function(ex) {
	console.error('WebSocketServer error:', ex);
	throw ex;
});

server.listen(1337, '127.0.0.1');

console.log('Server running');
