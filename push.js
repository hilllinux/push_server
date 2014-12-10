var
    io = require('socket.io'),
    ioServer = io.listen(8000),
    sequence = 1;
    clients = [];

// Event fired every time a new client connects:
ioServer.on('connection', function(socket) {
    console.info('New client connected (id=' + socket.id + ').');
    clients.push(socket);

    // When socket disconnects, remove it from the list:
    socket.on('disconnect', function() {
        var index = clients.indexOf(socket);
        if (index != -1) {
            clients.splice(index, 1);
            console.info('Client gone (id=' + socket.id + ').');
        }
    });
});

// Every 1 second, sends a message to a random client:
setInterval(function() {
    var randomClient;
    if (clients.length > 0) {
        randomClient = Math.floor(Math.random() * clients.length);
        clients[randomClient].emit('foo', sequence++);
    }
}, 1000);
