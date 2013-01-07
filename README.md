# wsock
wsock is an easy to use WebSocket implementation, as described by RFC 6455,
except for protocol extensions. It features both WebSocket server and client. 

## Installation
```bash
$ [sudo] npm install wsock
```

## Usage
### Server example
```javascript
var wsock = require('wsock');

var server = wsock.createServer();

server.on('connect', function(connection) {
	console.log('wsocket connected:', wsocket.socket.remoteAddress, 
		'(' + server.connections, '/', server.maxConnections + ')');

	wsocket.on('data', function(data, isBinary) {
		console.log('Recieved:', data.length > 64 ? data.length + ' bytes' : data);
		wsocket.send(data);
	});
	
	wsocket.on('close', function() {
		console.log('wsocket closed', 
			'(' + server.connections, '/', server.maxConnections + ')');
	});
	
	wsocket.on('error', function(ex) {
		console.error('wsocket error:', ex);
		throw ex;
	});
});

server.on('error', function(ex) {
	console.error('wsocketServer error:', ex);
	throw ex;
});

server.listen(80, 'localhost');
```

### Client example
```javascript
var wsock = require('wsock');

var client = wsock.connect({port: 80, host: 'localhost'}, function() {
	console.log('wsocket open', client.readyState);
	client.send('Hello World!');
});

client.on('data', function(data, isBinary) {
	console.log('Recieved:', data.length > 64 ? data.length + ' bytes' : data);
});

client.on('close', function() {
	console.log('wsocket closed');
});

client.on('error', function(ex) {
	console.error('wsocket error:', ex);
});

console.log('Client running');
```

## License (MIT)
Copyright (c) 2012, wronex.

## Author
[wronex][0]
[0]: http://www.wronex.com/
