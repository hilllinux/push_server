var
    io = require('socket.io-client'),
    ioClient = io.connect('http://localhost:3000');

ioClient.on('info', function(msg) {
    console.info(msg);
});

ioClient.emit('reg',"12")
//ioClient.emit('mailto',"12","hello")
