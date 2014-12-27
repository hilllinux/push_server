var io = require('socket.io'),
    ioServer = io.listen(3000),
    clients = {},
    unreg_clients = [];

var redis = require("redis");
var redis_client = redis.createClient('6379', '127.0.0.1');

// code for log info
var debug = 1;
function log(msg){
    if (1 == debug) console.info(msg);
}

log('SocketIO > listening on port :3000');

redis_client.on("ready", function() {
    log("redis is ready");
    redis_client.subscribe("msg");
})


redis_client.on("message", function(channel, msg){
    log(channel+":"+msg);

    var obj    = JSON.parse(msg);
    var id     = obj.userID,
        info   = obj.msg,
        app    = obj.app;
        type   = obj.type;

    if ('broadcast' == type) {
        //some code here for broadcast
        for (x in clients ) {
            clients[x].emit('info',info);
        }
    } else {
        clients[id].emit('info',info);
    }
});

//redis test
//redis_client.set("client_123", "test", redis.print);
//redis_client.get("client_123", redis.print);

// Event fired every time a new client connects:
ioServer.sockets.on('connection', function(socket) {
    log('New client connected (id=' + socket.id + ').');

    // notice user to reg
    if (!socket.uid) {
        log("unreg ueser login!");
        unreg_clients.push(socket);
        socket.emit('info','unreg');
    }


    socket.on('reg', function(message){
        log(message+":"+socket.id);

        socket.uid = message;
        clients[message] = socket;

        //remove from the unreg list
        var index = unreg_clients.indexOf(socket);
        if (index != -1) {
            unreg_clients.splice(index, 1);
            log('Client (id=' + socket.id + ') is vaild user now.');
        }

        socket.emit('info', message+":connected");
    })

    // method for broadcast to others, depreased;
    //socket.on('broadcast', function (message) {
    //    log('ElephantIO broadcast > ' + JSON.stringify(message));

    //    socket.broadcast.emit('info', JSON.stringify(message));
    //});

    socket.on('mailto', function(message){
        log(message[0]+":"+ message[1]);

        var userid = message[0],
            msg = message[1];

        if (clients[userid]) {
            clients[userid].emit('info',msg);
        } else {
            log(message+" --> not send!");
        }
    });

    // When socket disconnects, remove it from the list:
    socket.on('disconnect', function() {
        delete clients[socket.uid];
        log('Client gone (id=' + socket.uid + ').');
    });
});


// notice to reg in
setInterval(function() { for(x in unreg_clients) unreg_clients[x].emit("info","unreg");
}, 1000);

setInterval(function() {
    for (x in clients) clients[x].emit("info","this is message from server");
}, 2000);
