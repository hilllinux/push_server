var io = require('socket.io'),
    ioServer = io.listen(3000),
    clients = {},
    unreg_clients = [];

var redis = require("redis");
var redis_client = redis.createClient('6379', '127.0.0.1');

// code for log info
var debug = 1;
function log(msg){
    var date = new Date(); 
    if (1 == debug) console.info(date+" --> "+msg);
}

log('SocketIO > listening on port :3000');

// redis binding sub channel
redis_client.on("ready", function() {
    log("redis is ready");
    redis_client.subscribe("msg");
})

//handle the published message from the PHP server
redis_client.on("message", function(channel, msg){
    log(channel+":"+msg);

    // decode json to obj
    try {
        var obj = eval("(" + msg + ")");
    } catch (error) {
        log("invaild json fromat");
        return;
    }

    //get info from obj 
    var id     = obj.userID,
        info   = obj.msg,
        app    = obj.app,
        type   = obj.type;

    
    if (!id || !info || !app || !type) {
        log("paramter is not complete!")
        return ;
    }
    
    //send message
    if ('broadcast' == type) {
        //some code here for broadcast
        for (x in clients ) {
            clients[x].emit('info',info);
        }
    } else {
        if (clients[id]) clients[id].emit('info',info);
        else log("user: " + id+" is not online!");
    }
    
});


ioServer.sockets.on('connection', function(socket) {
    log('New client connected (id=' + socket.id + ').');

    // notice user to reg
    if (!socket.uid) {
        log("unreg ueser login!");
        unreg_clients.push(socket);
        socket.emit('info','unreg');
    }


    // handle bind socket to client ID flow;
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

    // mailto method. not use now
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


// notice user to reg in
setInterval(function() { for(x in unreg_clients) unreg_clients[x].emit("info","unreg");
}, 1000);

// timer set for push info to clients
setInterval(function() {
    for (x in clients) clients[x].emit("info","this is message from server");
}, 2000);
