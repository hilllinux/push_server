var
    io = require('socket.io'),
    ioServer = io.listen(3000),
    sequence = 1,
    clients = {};

var redis = require("redis");
var redis_client = redis.createClient('6379', '127.0.0.1');

redis_client.on("ready", function() {
    //console.log("Error" + err);
    console.log("redis is ready");
    redis_client.subscribe("msg");
})

redis_client.on("message", function(channel, msg){
    console.info(channel+" : "+ msg);
    clients['12'].emit('foo',msg);
});

//redis test
//redis_client.set("client_123", "test", redis.print);
//redis_client.get("client_123", redis.print);

// Event fired every time a new client connects:
ioServer.sockets.on('connection', function(socket) {
    console.info('New client connected (id=' + socket.id + ').');

    socket.on('broadcast', function (message) {
        console.info('ElephantIO broadcast > ' + JSON.stringify(message));
        socket.broadcast.emit('foo', JSON.stringify(message));
    });

    socket.on('reg', function(message){
        console.log(socket.id+" : "+message);
        socket.uid = message;
        clients[message] = socket;
        socket.emit('foo',"welcome:" + message);
        socket.broadcast.emit('foo', message+" have joined us");
    })

    socket.on('mailto', function(message){
        console.log(message[0]);
        console.log(message[1]);
        var userid = message[0],
            msg = message[1];
        if (clients[userid]) clients[userid].emit('foo',msg);
        else console.log("not send!");
    });

    // When socket disconnects, remove it from the list:
    socket.on('disconnect', function() {
        delete clients[socket.uid]
        console.info('Client gone (id=' + socket.id + ').');
    });

});

