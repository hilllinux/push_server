var
    io = require('socket.io-client'),
    ioClient = io.connect('http://106.187.51.112:3000');

ioClient.on('info', function(msg) {
    console.info(msg);
});

ioClient.emit('reg','{"app":"msd","id":"12345"}')
//ioClient.emit('mailto',"12","hello")
