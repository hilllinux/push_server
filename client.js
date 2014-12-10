var
    io = require('socket.io-client'),
    ioClient = io.connect('http://localhost:8000');

ioClient.on('foo', function(msg) {
    console.info(msg);
});
