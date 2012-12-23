var http = require('http'),
	net = require('net'),
	crypto = require('crypto'),
	events = require('events');

/**
 * Constant used for the WebSocket challenge.
 * @constant
 * @ignore
 */
var WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/**
 * Different OP codes used with the WebSocket protocol.
 * @constant
 * @ignore
 */
var OPCODE = {
	CONTINUE: 0x00,
	TEXT: 0x01,
	BINARY: 0x02,
	CLOSE: 0x08,
	PING: 0x09,
	PONG: 0x0A
}

/**
 * Different values used for the WebSocket's .readyState value.
 * @constant
 */
var READY_STATE = {
	// The WebSocket is connecting to a remote server. No data can be sent or
	// recieved.
	CONNECTING: 0,

	// The WebSocket is ready to recieve data.
	OPEN: 1,
	
	// The WebSocket have sent/recieved the CLOSE frame but the socket is still 
	// open. No data can be sent.
	CLOSING: 2,
	
	// The WebSocket is closed. No data can be sent or recieved.
	CLOSED: 3
}
exports.READY_STATE = READY_STATE;

/**
 * @class An error class that is used for generic errors withing the WebSocket 
 * module.
 * @param {string} message A description of the error that occured.
 */
function WebSocketError(message) {
	this.name = 'WebSocketError';
	this.message = message || '';
}
WebSocketError.prototype = Error.prototype;
exports.WebSocketError = WebSocketError;

/**
 * @class An error class that is used when a non-optional argument is null.
 * @param {string} arg Name of the argument that was null.
 * @extends WebSocketError
 */
function ArgumentNullError(arg) {
	this.name = 'ArgumentNullError';
	this.message = arg;
}
ArgumentNullError.prototype = WebSocketError.prototype;
exports.ArgumentNullError = ArgumentNullError;

/**
 * <p>
 * Creates a new WebSocketServer and returns it. The WebSocketServer is infact
 * a http.Server that upgrades sockets to WebSockets on request by the client.
 * The created web server will use the supplied requestListener function as a 
 * callback for new HTTP requests and can as such be used to create a fully 
 * functional web server with the ability to dual wield as a WebSocket server.
 * </p>
 *
 * <p>
 * Don't forget to call .listen() to bind a port and start listening for 
 * connections; .listen() will call the http.Server's .listen(). Thus, have a 
 * look at http.Server.listen() for more info.
 * </p>
 *
 * @param {Function} [requestListener] A function that is added to the web
 * server's 'request' event. If null, a default request listener will be used
 * that asweres all requests with '426 Upgrade Required'.
 *
 * @returns {WebSocketServer} A newly created WebSocketServer.
 *
 * @example
 * // Create a new WebSocket server.
 * var server = websocket.createServer();
 * 
 * server.on('connect', function(connection) {
 * 	console.log('WebSocket connected:', connection.socket.remoteAddress);
 * 	
 * 	connection.on('data', function(data, isBinary) {
 * 		console.log('Recieved:', data);
 * 		connection.send(data);
 * 	});
 * 	
 * 	connection.on('close', function() {
 * 		console.log('WebSocket closed');
 * 	});
 * });
 * 
 * // Start listening for connections.
 * server.listen(1337, 'localhost');
 */
function createServer(requestListener) {
	// If no request listener is given, use a simple one that will simply return
	// nothing.
	if (!requestListener) {
		/** @ignore */
		requestListener = function(req, res) {
			// Return 426 Upgrade Required, indicating that this server does not
			// do regular HTTP.
			res.writeHead(426, {'Content-Length': '0'});
			res.end();
		}
	}

	var httpServer = http.createServer(requestListener);
	return new WebSocketServer(httpServer);
}
exports.createServer = createServer;


/**
 * Use the supplied http.Server to listen for incomming upgrade requests. The 
 * http.Server's 'upgrade' event will be utilized.
 * @param {http.Server} httpServer A http.Server that will be used by the 
 * WebSocketServer to listen for new connections.
 * @returns {WebSocketServer} A newly created WebSocketServer.
 */
function listen(httpServer) {
	return new WebSocketServer(httpServer);
}
exports.listen = listen;

/**
 * Connects to a web socket server and returns the WebSocket.
 * 
 * @param {Object} [options] An object containing options used when connecting.
 *   The values of the object will be applied to the created WebSocket; apart 
 *   from <i>port</i> and <i>host</i> which will be supplied to the created 
 *   HttpServer. See WebSocket for possible values.
 * <pre><code>Object format {
 * 	host: {string} Optional. Server ip or hostname. Defaults to 'localhost'.
 * 	port: {int} Optional. Server port. Defaults to 80.
 * 	<i>origin: or other values from WebSocket.</i>
 * }</code></pre>
 * 
 * @param {Function} [callback] A callback function that will be bound to the
 * WebSocket's 'open' event. This is only for convenience.
 * 
 * @returns {WebSocket} A newly created WebSocket.
 *
 * @example
 * // Connect to a WebSocketServer.
 * var client = websocket.connect({port: 1337, host: 'localhost'}, function() {
 * 	console.log('WebSocket open', client.readyState);
 * 	client.send('Hello');
 * });
 * 
 * client.on('data', function(data, isBinary) {
 * 	console.log('Recieved:', data.length > 64 ? data.length + ' bytes' : data);
 * });
 */
function connect(options, callback) {
	options = options || {};
	
	// Prepare the options that will be given to the new HttpServer.
	var serverHost = options.host || 'localhost';
	var serverPort = options.port || 80;
	
	// Remove any options specific for the HttpServer, since the rest of the
	// values will be used to overwrite values in the WebSocket.
	delete options.host;
	delete options.port;
	
	// Create the WebSocket that will recieve all events; and that will
	// eventually be assigned the socket generated by the HTTP request below.
	var webSocket = new WebSocket();
	
	// Copy any value from the options object to the newly created WebSocket.
	for (value in options) {
		if (webSocket.hasOwnProperty(value))
			webSocket[value] = options[value];
	}
	
	if (callback)
		webSocket.on('open', callback);
	
	// The security key should be 16 bytes long and base 64 encoded. The data
	// should be random.
	var randomBuf = crypto.randomBytes(16);
	var secKey = randomBuf.toString('base64');
	
	// The client should then response with the following value.
	var sha1 = crypto.createHash('sha1');
	sha1.update(secKey + WEBSOCKET_GUID, 'ascii');
	var secAccept = sha1.digest('base64');
	
	var reqOptions = {
		host: serverHost,
		port: serverPort,
		headers: {
			'Upgrade': 'websocket',
			'Connection': 'Upgrade',
			'Sec-WebSocket-Version': '13',
			'Sec-WebSocket-Key': secKey
		}
	};
	
	if (options.origin)
		reqOptions.headers.Origin = options.origin;
	
	var req = http.request(reqOptions, function(res) {
		// This event should not fire if the host is a WebSocket server.
		try {
			throw new WebSocketError('Incorrect HTTP status code: ' + res.statusCode);
		} catch (ex) {
			webSocket._onError(ex);
		}
	});
	
	req.on('upgrade', function(res, socket, head) {
		// The response should look something like this
		//
		// HTTP/1.1 101 Switching Protocols
        // Upgrade: websocket
        // Connection: Upgrade
        // Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
        // 
        try {
			if (!res.headers['upgrade'] || res.headers['upgrade'].toLowerCase() != 'websocket')
				throw new WebSocketError('Incorrect upgrade-value: ' + res.headers['upgrade']);
			
			if (res.headers['sec-websocket-accept'] != secAccept)
				throw new WebSocketError('Incorrect security key response.');
			
			// Our request was accepted! The socket have now been upgraded to a 
			// web socket.
			webSocket._open(socket);
		} catch (ex) {
			webSocket._onError(ex);
		}
	});
	
	req.on('error', function(ex) {
		webSocket._onError(ex);
	});
	
	req.end('');
	
	return webSocket;
}
exports.connect = connect;

/**
 * @class A WebSocketServer will listen for request's using a http.Server's 
 * 'upgrade' event and upgrade incomming connection's to WebSockets. Thus a
 * WebSocketServer must be used in conjunction with an http.Server.
 *
 * <p>Event 'connect': function(webSocket) { } <br>
 * Emitted each time a new WebSocket is created. 'webSocket' is an instance of
 * WebSocket.</p>
 *
 * <p>Event 'error': function(ex) { } <br>
 * Emitted if an error occures within the WebSocket server. 'ex' contains the 
 * error that occured.</p>
 *
 * @extends {events.EventEmitter}
 *
 * @param {http.Server} httpServer The WebSocketServer will utilize this 
 * http.Server's 'upgrade' event to upgrade connections to web sockets.
 */
function WebSocketServer(httpServer) {
	if (!httpServer)
		throw new ArgumentNullError('httpServer');
	
	/**
	 * Number of current WebSocket connections.
	 * @type int
	 */
	this._connections = 0;
	
	/**
	 * Number of maximum allowed WebSocket connections.
	 * @type int
	 * @default 10
	 */
	this.maxConnections = 10;
	
	/**
	 * If non-zero all connected WebSocket's will send a heartbeat PONG frame
	 * after this amount of inactivity (in milliseconds) to avoid connection 
	 * timeout. If changed, only new WebSockets will be affected; use 
	 * WebSocket.setHeartbeatTimeout() to change existing once.
	 * @type int
	 * @default 100000
	 */
	this.heartbeatTimeout = 100000;
	
	/**
	 * If set, the server will only accept WebSocket connection with the same
	 * origin. The origin should be lower case and it should not contain a
	 * prefix such as 'http://' or 'ws://'. Example value: 'www.example.com:81'.
	 * @type String
	 * @default null
	 */
	this.origin = null;
	
	/**
	 * Indicates if data recieved from clients is required to be masked. See
	 * WebSocket.requireMaskedData for more information.
	 * @type bool
	 * @default false
	 */
	this.requireMaskedData = false;
	
	/**
	 * An instance of http.Server that is used to upgrade HTTP sessions into
	 * WebSocket connections. It can also be used as a normal web server.
	 * @type http.Server
	 */
	this._httpServer = httpServer;
	this._httpServer.on('upgrade', this._onUpgrade.bind(this));
	
	// Bind the web server's listen function to this web socket server. That way
	// we can avoid defining our own .listen() function.
	this.listen = this._httpServer.listen.bind(this._httpServer);
}
WebSocketServer.prototype = new events.EventEmitter;

/**
 * Gets the number of current WebSocket connections.
 * @type int
 */
WebSocketServer.prototype.__defineGetter__('connections', function() {
	return this._connections;
});

/**
 * Gets the http.Server instance used when listening for WebSocket connections.
 * @type http.Server
 */
WebSocketServer.prototype.__defineGetter__('httpServer', function() {
	return this._httpServer;
});

/**
 * This function is fired on the .httpServer's 'upgrade' event. This is the core
 * of the WebSocketServer since this is here new WebSockets are created.
 * @private
 */
WebSocketServer.prototype._onUpgrade = function(req, socket, upgradeHead) {
	try {
		if (!req.headers['upgrade'] || req.headers['upgrade'].toLowerCase() != 'websocket') {
			// We can only upgrade to websocket connections.
			//throw new WebSocketError('Client tried to upgrade connection to: ' + req.headers['upgrade']);
			this._sendHTTPError('400 Bad Request');
			return;
		}
			
		if (req.headers['sec-websocket-version'] != '13') {
			// Only one version is currently supported.
			//throw new WebSocketError('Client used unknown websocket protocol version: ' + req.headers['sec-websocket-version']);
			this._sendHTTPError('400 Bad Request');
			return;
		}
		
		if (this._connections >= this.maxConnections) {
			// To many connections.
			this._sendHTTPError('503 Service Unavailable');
			return;
		}
		
		if (this.origin && (!req.headers['origin'] && 
			(req.headers['origin'].toLowerCase() != 'ws://' + this.origin 
			|| req.headers['origin'].toLowerCase() != 'http://' + this.origin))) {
			// This server requires that any incomming connection supplies the
			// same origin as the server's .origin. This request did not. Close
			// it.
			this._sendHTTPError('403 Forbidden');
			return;
		}
		
		// Now it is time to face the challenge sent by the client. Calculate
		// the security response as described in the protocol.
		var sha1 = crypto.createHash('sha1');
		sha1.update(req.headers['sec-websocket-key'] + WEBSOCKET_GUID, 'ascii');
		var secAccept = sha1.digest('base64');
		
		// Send our response to the client. Hopefully it will approve of our
		// callenge response.
		socket.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
					 'Upgrade: WebSocket\r\n' +
					 'Connection: Upgrade\r\n' +
					 'Sec-WebSocket-Accept: ' + secAccept +
					 '\r\n\r\n');
		
		// Create a new WebSocket object that will handle the socket from here.
		// Also, tell anyone listening that a new web socket connection was
		// made.
		var webSocket = new WebSocket();
		webSocket.isBrowser = req.headers['Origin'] != null;
		webSocket.requireMaskedData = this.requireMaskedData;
		webSocket.on('close', this._onWebSocketClosed.bind(this, webSocket));
		webSocket._open(socket);
		webSocket.setHeartbeatTimeout(this.heartbeatTimeout);
		
		this._connections++;
		
		this.emit('connect', webSocket);
	} catch (ex) {
		this._sendHTTPError('500 Internal Server Error');
		this._onError(ex);
	}
}

/**
 * Sends an HTTP error to the supplied socket and then ends the connection.
 * @param {net.Socket} socket A socket to end.
 * @param {string} error HTTP error message.
 * @private
 */
WebSocketServer.prototype._sendHTTPError = function(socket, error) {
	try {
		socket.end('HTTP/1.1 ' + error + '\r\n\r\n');
	} catch (ex) {
	}
}

/**
 * This function is called when a WebSocket is closed.
 * @param {WebSocket} webSocket A WebSocket that was closed.
 * @private
 */
WebSocketServer.prototype._onWebSocketClosed = function(webSocket) {
	this._connections--;
	if (this._connections < 0)
		this._connections = 0;
}

/**
 * This function is called when an error occures within the WebSocketServer or
 * its http.Server.
 * @param {Object} ex An object with information about the error.
 */
WebSocketServer.prototype._onError = function(ex) {
	this.emit('error', ex);
}


/**
 * @class Holds information about a WebSocket frame recieved from a client. 
 * Frames are used to encode data sent by clients to the server (and the other 
 * way around).
 */
function Frame() {
	/**
	 * Indicates if the frame is the final one in its message.
	 * @type bool
	 */
	this.isFinal = false;
	
	/**
	 * The frame's operation code.
	 * @type int
	 */
	this.opcode = -1;
	
	/**
	 * Indicates if the frame's data is masked.
	 * @type bool
	 */
	this.isMasked = false;
	
	/**
	 * The frame's payload length. Only set to its proper value if the entire 
	 * frame have been recieved (otherwise less or equal to 127).
	 * @type int
	 */
	this.length = 0;
	
	/**
	 * If the payload is masked, this array will hold the masking key. Only set
	 * if the entire frame have been recieved.
	 * @type int[]
	 */
	this.maskingKey = null;
	
	/**
	 * The frame's payload. Only set if the entire frame have been recieved.
	 * @type Buffer
	 */
	this.payload = null;
	
	/**
	 * The frame's payload starts at this index in the WebSocket's buffer.
	 * @type int
	 */
	this.payloadStart = 0;
	
	/**
	 * The index of the frame's first byte in the WebSocket's buffer.
	 * @type int
	 */
	this.frameStart = 0;
}


/**
 * @class <p>A WebSocket is used to communicate with web browsers using the 
 * WebSocket protocol wich allows data to be sent both ways using TCP/IP. Please
 * note that ._open() must be called to assign a socket to the WebSocket.</p>
 *
 * <p>When a WebSocket recieves data it will store it in its internal buffer; 
 * and when enough data have been reiceved it will try to parse frames and 
 * messages from the buffer. At any given time, the buffer might contain none, 
 * one or more frames. After each time data have been recieved the WebSocket 
 * will try to parse it for frames; and will do so until the buffer is empty or 
 * contains uncomplete frames.</p>
 *
 * <p>Event 'data': function(data, isBinary) { } <br>
 * Emitted when a message is recieved from the client. 'data' is a string if the
 * boolean 'isBinary' is false else it is a Buffer.</p>
 *
 * <p>Event 'open': function() { } <br>
 * Emitted when the WebSocket is connected and ready to recieve data. This event
 * is only used for WebSockets created with websocket.connect().</p>
 *
 * <p>Event 'close': function() { } <br>
 * Emitted when the WebSocket is closed.</p>
 *
 * <p>Event 'error': function(ex) { } <br>
 * Emitted when an exception occures in the WebSocket. 'ex' is the error.</p>
 *
 * @extends {events.EventEmitter}
 */
function WebSocket() {
	/**
	 * A partially downloaded frame. While there is not enough data to parse the
	 * entire frame, it will be temporarily stored here.
	 * @type Frame
	 * @private
	 */
	this._partialFrame = null;
	
	/**
	 * If a partial message is recieved it will be buffered here until all of
	 * the data is present; otherwise null.
	 * @type Buffer
	 * @private
	 */
	this._partialMessage = null;
	
	/**
	 * Indicates if the partial message buffered in ._partialMessage is text;
	 * otherwise it is binary.
	 * @type bool
	 * @private
	 */
	this._partialMessageIsText = null;
	
	/**
	 * A buffer that will hold any data sent from the client. Frame's sent by
	 * the client will be parsed from the buffer when enough data is stored.
	 * @type Buffer
	 * @private
	 */
	this._buffer = new Buffer(0);
	
	/**
	 * Number of processed bytes; any byte before this index have already been 
	 * processed and used in a frame.
	 * @type int
	 * @private
	 */
	this._bufferOffset = 0;
	
	/**
	 * Index of last byte in buffe; any byte beyond this index is 0x00.
	 * @type int
	 * @private
	 */
	this._bufferEnd = 0;
	
	/**
	 * If non-zero, the WebSocket will send a hearbeat PONG frame after this
	 * time of inactivity (in milliseconds). Set using .setHeartbeatTimeout().
	 * @type int
	 * @default 0
	 */
	this.heartbeatTimeout = 0;
	
	/**
	 * If set, a heartbeat timeout timer is active; its ID is stored here.
	 * @type int
	 * @default null
	 */
	this._heartbeatTimeoutId = null;
	
	/**
	 * Indicates if data sent by the WebSocket should be masked. All browser
	 * clients will mask their data, as such if the WebSocket is connected to
	 * a web socket server, masking might be required. If the WebSocket exists
	 * on the server side, the data should not be masked.
	 * @type bool
	 * @default false
	 */
	this.maskData = false;
	
	/**
	 * Indicates if the data recieved on the WebSocket is required to be masked.
	 * All browser clients will mask their data when sending, thus, masking can
	 * be required if only browser clients should connect. If the WebSocket will
	 * be used by a server, the masking requirement can be disabled to increase 
	 * performance when communicating with other WebSockets.
	 * @type bool
	 * @default false
	 */
	this.requireMaskedData = false;
	
	/**
	 * Maximum allowed length of recieved frame, in bytes. If the lenght of a
	 * single frame exceeds this value, the connection will be terminated. A 
	 * value of zero will disabel this feature.
	 * @type int
	 * @default 1048576 (1 MB)
	 */
	this.frameMaxLength = 1048576;
	
	/**
	 * Maximum allowed length of recieved message, in bytes. If the lenght of a
	 * single a message, exceeds this value, the connection will be terminated. 
	 * A value of zero will disabel this feature.
	 * @type int
	 * @default 1048576 (1 MB)
	 */
	this.messageMaxLength = 1048576;
	
	/**
	 * Maximum allowed length of PING frame payload length, in bytes. If the 
	 * payload length exceeds this value, the connection will be closed. A value 
	 * of zero disables this feature.
	 * @type int
	 * @default 1024 (1 kB)
	 */
	this.pingMaxLength = 1024;
	
	/**
	 * Indicates if the WebSocket originates from a browser client.
	 * @type bool
	 * @default false
	 */
	this.isBrowser = false;
	
	/**
	 * The socket's state. See {@link READY_STATE} enum for possible values.
	 * @type int
	 * @default READY_STATE.CONNECTING
	 */
	this.readyState = READY_STATE.CONNECTING;

	/**
	 * The WebSocket's underlying socket used when communicating over TCP/IP 
	 * with the client.
	 * @type net.Socket
	 * @default null
	 */
	this.socket = null;
}
WebSocket.prototype = new events.EventEmitter;

/**
 * Opens the WebSocket by assigning its underlying socket. This function must be
 * called on all WebSockets.
 * @param {net.Socket} socket A socket ready to recieve and send data using the
 * web socket protocol.
 * @protected
 */
WebSocket.prototype._open = function(socket) {
	try {
		if (!socket)
			throw new ArgumentNullError('socket');
		
		if (this.socket)
			throw new WebSocketError('Socket already assigned.');
		
		if (this.readyState != READY_STATE.CONNECTING)
			throw new WebSocketError('Not connecting.');
		
		this.socket = socket;
		this.socket.on('close', this._onClose.bind(this));
		this.socket.on('end', this._onEnd.bind(this));
		this.socket.on('error', this._onError.bind(this));
		this.socket.on('data', this._onData.bind(this));
		
		this.readyState = READY_STATE.OPEN;
		this.emit('open');
	} catch (ex) {
		this._onError(ex);
	}
}

/**
 * Close the WebSocket and its underlying socket.
 */
WebSocket.prototype.close = function() {
	if (this.readyState != READY_STATE.OPEN)
		return;

	this.readyState = READY_STATE.CLOSING;
	
	try {
		// Try sending a close frame. It might not work.
		this._send(OPCODE.CLOSE, new Buffer(0));
	} catch (ex) {
	}
	
	// Do not allow any more I/O on the socket.
	this.socket.destroy();
}

/**
 * This function is fired by the .socket's 'close' event.
 * @private
 */
WebSocket.prototype._onClose = function() {
	if (this.readyState == READY_STATE.CLOSED)
		return;
	
	this.readyState = READY_STATE.CLOSED;
	
	// Cleanup.
	if (this._heartbeatTimeoutId != null)
		clearTimeout(this._heartbeatTimeoutId);
	
	this._buffer = null;
	this._partialFrame = null;
	this._partialMessage = null;
	
	this.emit('close');
}

/**
 * This function is fired by the .socket's 'end' event.
 * @private
 */
WebSocket.prototype._onEnd = function() {
	// Do not allow any more I/O on the socket.
	this.socket.destroy();
	this._onClose();
}

/**
 * This function is fired by the .socket's 'error' event, or by any error that
 * occures within the WebSocket.
 * @private
 */
WebSocket.prototype._onError = function(ex) {
	this.close();	
	this.emit('error', ex);
}

/**
 * This function is fired after some time of inactivity on the socket; it will 
 * send a heartbeat PONG frame to the client in order to keep the connection 
 * alive. 
 * @private
 */
WebSocket.prototype._sendHeartbeat = function() {
	this._send(OPCODE.PONG, new Buffer(0));
}

/**
 * This function is fired by the .socket's 'data' event. It will parse the
 * recieved data as a WebSocket frames. When an entire frame have been recieved
 * it will  and call ._handleFrame().
 * @private
 */
WebSocket.prototype._onData = function(data) {
	if (this.readyState == READY_STATE.CONNECTING)
		return; // Protocol not yet negotiated.
	
	if (this.heartbeatTimeout > 0)
		this._resetHeartbeatTimeout();
	
	try {
		// When recieving data, we might recieve 2 bytes or 65 kB, we never
		// know what to expect. Thus, we must ensure there is enough data to
		// parse a frame's header before trying, and we must also ensure that
		// the entire frame's payload have been downloaded before throwing a
		// message event.
		
		// Append the new data to the buffer.
		var lengthOfAllData = this._bufferEnd + data.length;
		if (lengthOfAllData > this._buffer.length - this._bufferEnd) {
			// The current buffer is too small to hold all the data; enlarge it
			// and add all the new and old data.	
			var buffer = new Buffer(lengthOfAllData);
			this._buffer.copy(buffer, 0, 0, this._bufferEnd);
			data.copy(buffer, this._bufferEnd);
			
			this._buffer = buffer;
		} else {
			// The current buffer can hold all of the recieved data.
			data.copy(this._buffer, this._bufferEnd);
		}
		this._bufferEnd = lengthOfAllData;
		
		// Try to parse a frame from the downloaded data.
		this._parseFrame();
	} catch (ex) {
		this._onError(ex);
	}
}

/**
 * Tries to parse a frame from the current buffered data. A frame will not be
 * parsed until the buffer contains the entire frame. When successfully parsed
 * ._handleFrame() will be called.
 * @private
 */
WebSocket.prototype._parseFrame = function() {
	if (this._partialFrame) {
		// A partially downloaded frame already exists. The new downloaded data
		// might contain some more payload and/or another frame.
		this._parseFramePayload();
		return;
	}
	
	// According to the WebSocket protocol data is sent in frames as the one
	// described below.
	//
	// http://tools.ietf.org/html/draft-ietf-hybi-thewebsocketprotocol-17#section-5
	// 
	//   0               1               2               3
	//   0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7
	//  +-+-+-+-+-------+-+-------------+-------------------------------+
	//  |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
	//  |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
	//  |N|V|V|V|       |S|             |   (if payload len==126/127)   |
	//  | |1|2|3|       |K|             |                               |
	//  +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
	//  |     Extended payload length continued, if payload len == 127  |
	//  + - - - - - - - - - - - - - - - +-------------------------------+
	//  |                               |Masking-key, if MASK set to 1  |
	//  +-------------------------------+-------------------------------+
	//  | Masking-key (continued)       |          Payload Data         |
	//  +-------------------------------- - - - - - - - - - - - - - - - +
	//  :                     Payload Data continued ...                :
	//  + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
	//  |                     Payload Data continued ...                |
	//  +---------------------------------------------------------------+
	
	// Keep track of the buffer offset, localy, since it might not be stored.
	var offset = this._bufferOffset;
	
	// Make sure there is enough data to read the beginning of the header.
	if (this._bufferEnd - offset < 2)
		return;
	
	var frame = new Frame();
	frame.frameStart = offset;
	
	// Read the two bytes required to parse the header.
	var byte0 = this._buffer[offset++];
	var byte1 = this._buffer[offset++];
	
	with (frame) {
		isFinal = (byte0 & 0x80) > 0;
		opcode = byte0 & 0x0F;
		isMasked = (byte1 & 0x80) > 0;
		length = byte1 & 0x7F;
	}
	
	if (this.requireMaskedData && !frame.isMasked)
		throw new WebSocketError('Unmasked data recieved while is required to be masked.');
	
	// Make sure there is enough data to read the rest of the header.
	var requiredData = 0;
	if (frame.length == 126)
		requiredData += 2;
	if (frame.length == 127)
		requiredData += 8;
	if (frame.isMasked)
		requiredData += 4;
	
	if (this._bufferEnd - offset < requiredData) {
		// There is currently not enough data in the buffer to parse the rest of
		// the frame.
		return;
	}
	
	// Was the payload's length extended?
	if (frame.length == 126) {
		// Payload length extended to two bytes.
		frame.length = this._buffer.readUInt16BE(offset);
		offset += 2;
	} else if (frame.length == 127) {
		// Payload length extended to eight bytes. We can not read the last 
		// four...
		offset += 4;
		frame.length = this._buffer.readUInt32BE(offset);
		offset += 4;
		
		if (frame.length >= 4294967295) {
			// For now, only data lengths that can fit into a 32-bit
			// unsigned integer are allowed.
			throw new WebSocketError('Too much data.');
		}
	}
	
	if (this.frameMaxLength > 0 && frame.length > this.frameMaxLength) {
		// The recieved frame exceeds the maximum allowed length.
		throw new WebSocketError('Frame payload exceeds maximum allowed length.');
	}
	
	// Read masking key, if any.
	if (frame.isMasked) {
		frame.maskingKey = [
			this._buffer[offset++], 
			this._buffer[offset++], 
			this._buffer[offset++], 
			this._buffer[offset++]
		];
	}
	
	// Keep track of where the frame's data starts in the buffer.
	frame.payloadStart = offset;
	
	this._partialFrame = frame;
	this._bufferOffset = offset;
	
	this._parseFramePayload();
}

/**
 * Tries to parse the partially loaded frame's payload. The frame will only be
 * successfully loaded if the entire payload is present in the buffer; when 
 * parsend ._handleFrame() will be called.
 * @private
 */
WebSocket.prototype._parseFramePayload = function() {
	if (!this._partialFrame)
		throw new WebSocketError('Unable to parse payload since no partial frame exists.');
	
	var frame = this._partialFrame;
	
	if (this._bufferEnd - frame.payloadStart < frame.length) {
		// The buffer does not yet contain the entire payload.
		return;
	}
	
	if (frame.isMasked) {
		// Demask the payload data.
		for (var i = frame.length - 1; i >= 0; i--)
			this._buffer[i + frame.payloadStart] = this._buffer[i + frame.payloadStart] ^ frame.maskingKey[i % 4];
	}
	
	// Store the frame's payload.
	var payloadEnd = frame.payloadStart + frame.length;
	frame.payload = this._buffer.slice(frame.payloadStart, payloadEnd);
	
	// Remove the frame from the buffer and do some cleanup.
	this._buffer = this._buffer.slice(payloadEnd);
	this._bufferEnd = this._buffer.length;
	this._bufferOffset = 0;
	this._partialFrame = null;
	
	// Frame decoded and ready.
	this._handleFrame(frame);
	
	if (this._bufferEnd > 0) {
		// There is still some data in the buffer; it might contain another
		// frame...
		this._parseFrame();
	}
}

/**
 * Handels the supplied frame according to the WebSocket protocol and emits the
 * corresponding events, if any.
 * @param {Object} frame Information about the frame.
 * @private
 */
WebSocket.prototype._handleFrame = function(frame) {
	try {
		switch (frame.opcode) {
			case OPCODE.BINARY: 
				// Binary data recieved. It might be fragmented.
				if (frame.isFinal) {
					// Message is not fragmented.
					this.emit('data', frame.payload, true);
					return;
				}
				
				// Message is fragmented and this is the message's first frame.
				if (this._partialMessage)
					throw new WebSocketError('Fragmented message recieved but there is already a partial message in the buffer.');
				
				this._partialMessage = frame.payload;
				this._partialMessageIsText = false;
				return;
		
			case OPCODE.TEXT: 
				// Text data recieved, encoded as UTF8. It might be fragmented.
				if (frame.isFinal) {
					// Message is not fragmented.
					var data = frame.payload.toString('utf8');
					this.emit('data', data, false);
					return;
				}
				
				// Message is fragmented and this is the message's first frame.
				if (this._partialMessage)
					throw new WebSocketError('Fragmented message recieved but there is already a partial message in the buffer.');
					
				this._partialMessage = frame.payload;
				this._partialMessageIsText = true;
				return;
				
			case OPCODE.CONTINUE: 
				// Fragmented message recieved. There should already be a 
				// partial message in the ._partialMessage buffer.
				if (!this._partialMessage)
					throw new WebSocketError('CONTINUE frame recieved but no partial message was present in the buffer.');
				
				// Append the partial message to the buffer. If this is not the
				// final frame, more data will be appended to the buffer when
				// the next frame is recieved.
				
				// Calculate the length of the new buffer and make sure it does
				// not exceed the maximum allowed length.
				var newLength = this._partialMessage.length + frame.length;
				
				if (this.messageMaxLength > 0 && newLength > this.messageMaxLength)
					throw new WebSocketError('Message exceeds maximum allowed length.');
				
				// Create the new buffer and copy the old data and append the
				// new.
				var buffer = new Buffer(newLength);
				this._partialMessage.copy(buffer);
				frame.payload.copy(buffer, this._partialMessage.lenght);
				this._partialMessage = buffer;
				
				if (frame.isFinal) {
					// This was the final frame -- the entire message have been
					// recieved.
					var data = this._partialMessage;
					
					var isText = this._partialMessageIsText;
					if (isText)
						data = data.toString('utf8');
					
					// Clean up.
					this._partialMessage = null;
					this._partialMessageIsText = null;
					
					this.emit('data', data, !isText);
				}
				return;
			
			case OPCODE.CLOSE:
				// Client says it is time to close the connection. We must obay.
				this.close();
				return;
			
			case OPCODE.PING:
				// PING frames are sent as keep-alive, heartbeat etc. Any data
				// found should be returned.
				if (this.pingMaxLength > 0 && frame.length > this.pingMaxLength) {
					// Only reply to a PING if the sent data does not exceed the
					// maximum allowed length. This is a try to avoid ping of
					// death.
					throw new WebSocketError('Maximum PING data length exceeded.');
					return;
				}
				
				this._send(OPCODE.PONG, frame.payload);
				return;
			
			case OPCODE.PONG:
				// Unsolicited PONG frame -- a response is not expected. This
				// serves as a unidirectional heartbeat.
				return;
			
			default:
				throw new WebSocketError('Unsupported OP code: ' + frame.opcode);
		}
	} catch (ex) {
		this._onError(ex);
	}
}

/**
 * Sends the supplied payload to the client using the supplied operation code.
 * @param {int} opcode Decides wich OP code to use when sending the payload.
 * @param {Buffer} payload A payload that will be sent to the client.
 * @private
 */
WebSocket.prototype._send = function(opcode, payload) {
	if (this.readyState != READY_STATE.OPEN)
		return;
	
	// TODO: Rewrite the send code to not buffer the data twice. Instead small
	// amounts of data can be sent each time instead (this will thus affect the
	// payload buffer if masking is enabled).
	
	if (this.heartbeatTimeout > 0)
		this._resetHeartbeatTimeout();

	try {		
		// In order to send data, it must be encoded in a frame similar to the one
		// used when data is recieved.
		// 
		// http://tools.ietf.org/html/draft-ietf-hybi-thewebsocketprotocol-17
		//
		//   0               1               2               3
		//   0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7
		//  +-+-+-+-+-------+-+-------------+-------------------------------+
		//  |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
		//  |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
		//  |N|V|V|V|       |S|             |   (if payload len==126/127)   |
		//  | |1|2|3|       |K|             |                               |
		//  +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
		//  |     Extended payload length continued, if payload len == 127  |
		//  + - - - - - - - - - - - - - - - +-------------------------------+
		//  |                               |Masking-key, if MASK set to 1  |
		//  +-------------------------------+-------------------------------+
		//  | Masking-key (continued)       |          Payload Data         |
		//  +-------------------------------- - - - - - - - - - - - - - - - +
		//  :                     Payload Data continued ...                :
		//  + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
		//  |                     Payload Data continued ...                |
		//  +---------------------------------------------------------------+
		//
		
		var payloadLength = payload.length;
		
		// Total length of frame.
		var length = payloadLength + 2;
		
		// Do we need to extend the payload length field?
		if (payloadLength >= 126)
			length += 2;
		if (payloadLength >= 65536)
			length += 6;
		if (this.maskData)
			length += 4;
		
		// Keep track of the current frame buffer offset.
		var offset = 0;
		
		// Create the buffer that will hold the entier frame.
		var frameBuffer = new Buffer(length);
		frameBuffer[offset++] = 0x80 + (opcode & 0x0F); // FIN = 1, OPCODE = opcode
		
		// Append the payload length...
		if (payloadLength < 126) {
			frameBuffer[offset++] = payloadLength;
		} else if (payloadLength < 65536) {
			// Payload length extended to two bytes.
			frameBuffer[offset++] = 126;
			frameBuffer.writeUInt16BE(payloadLength, offset);
			offset += 2;
		} else {
			// Payload length extended to eight bytes.
			if (payloadLength > 4294967295) {
				// For now, only data lengths that can fit into a 32-bit
				// unsigned integer are allowed.
				throw new WebSocketError('Frame payload length not suppored.');
			}
			
			frameBuffer[offset++] = 127;
			frameBuffer.writeUInt32BE(0, offset);
			offset += 4;
			frameBuffer.writeUInt32BE(payloadLength, offset);
			offset += 4;
		}
		
		if (this.maskData)
			offset += 4;
		
		// Copy the payload to the frame. This will allow a single .write() to
		// be made on the socket.
		payload.copy(frameBuffer, offset);
		
		if (this.maskData) {
			// Mask the payload in the frame buffer.
			frameBuffer[1] |= 0x80;
			
			var maskKey = crypto.randomBytes(4);
			maskKey.copy(frameBuffer, offset - 4);
			
			for (var i = payload.length - 1; i >= 0; i--)
				frameBuffer[i + offset] = frameBuffer[i + offset] ^ maskKey[i % 4];
		}
		
		// The frame is now ready to be sent to the client!
		this.socket.write(frameBuffer);
	} catch (ex) {
		this._onError(ex);
	}
}

/**
 * Sends the supplied payload to the client as text.
 * @param {string|Buffer} payload A payload that will be sent. The payload can
 * eighter be a string (sent as text) or a Buffer (sent as binary).
 */
WebSocket.prototype.send = function(payload) {
	if (this.readyState != READY_STATE.OPEN)
		return;
	
	if (typeof payload == 'string')
		this._send(OPCODE.TEXT, new Buffer(payload, 'utf8'));
	else
		this._send(OPCODE.BINARY, payload);
}

/**
 * Sets the timeout after which the WebSocket's sends a hearbeat frame to the
 * client. A heartbeat frame will only be sent after the supplied time of
 * inactivity (in milliseconds).
 * @param {int} timeout Timeout (in milliseconds). If zero, no hearbeat frames 
 * will be sent.
 */
WebSocket.prototype.setHeartbeatTimeout = function(timeout) {
	if (timeout < 0)
		timeout = 0;

	this.heartbeatTimeout = timeout;
	
	if (this._heartbeatTimeoutId != null)
		clearTimeout(this._heartbeatTimeoutId);
	
	if (timeout > 0)
		this._heartbeatTimeoutId = setTimeout(this._sendHeartbeat.bind(this), timeout);
	else
		this._heartbeatTimeoutId = null;
}

/**
 * Resets the current heartbeat timeout if any. This function should be called
 * each time there is activity on the socket and if .heartbeatTimeout is
 * non-zero.
 */
WebSocket.prototype._resetHeartbeatTimeout = function() {
	if (this._heartbeatTimeoutId != null)
		clearTimeout(this._heartbeatTimeoutId);
	
	this._heartbeatTimeoutId = setTimeout(this._sendHeartbeat.bind(this), this.heartbeatTimeout);
}