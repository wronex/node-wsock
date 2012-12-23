var websocket = require('../lib/websocket.js');

function send(socket, data) {
	socket.send(data);
	console.log('Sent:', data.length > 64 ? data.length + ' bytes' : data);
}

function sendRandomData(socket, len) {
	var data = '';
	for (var i = len || 10; i > 0; i--) {
		data += String.fromCharCode(32 + (100 * Math.random()) | 0);
	}
	send(socket, data);
}

var client = websocket.connect({port: 1337}, function() {
	console.log('WebSocket open', client.readyState);
	send(client, 'Hello');
	sendRandomData(client, 60000);
	sendRandomData(client, 70000);
	sendRandomData(client, 100000);
	sendRandomData(client, 700000);
});

client.on('data', function(data, isBinary) {
	console.log('Recieved:', data.length > 64 ? data.length + ' bytes' : data);
});

client.on('close', function() {
	console.log('WebSocket closed');
});

client.on('error', function(ex) {
	console.error('WebSocket error:', ex);
});

console.log('Client running');

setInterval(function() {
	if (client.readyState != websocket.READY_STATE.OPEN)
		return;

	sendRandomData(client, (10000 * Math.random()) | 0);
	sendRandomData(client, (10000 * Math.random()) | 0);
}, 100);
