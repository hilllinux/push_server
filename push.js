var io = require('socket.io'),
    ioServer = io.listen(3000),
    clients = {},
    unreg_clients = [];

var redis = require("redis");
var redis_client = redis.createClient('6379', '127.0.0.1');

// code for log info
// debug function
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
        var obj = JSON.parse(msg);
        var id     = obj.id,
            info   = obj.msg,
            app    = obj.app,
            type   = obj.type;

        if (!id || !info || !app || !type) {
            log(error);
            log("paramter is not complete!")
            return ;
        }
        //send message
        if (clients[app][id]) clients[app][id].emit('info',info);
        else log("user: " + id+" is not online!");

    } catch (error) {
        log(error);
        log("PHP send invaild json fromat");
        return;
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
    // {"app":"msd","id":"123"}
    socket.on('reg', function(message){
        log(socket.id+":"+message);

        try{
            var client_message = JSON.parse(message);

            var app      = client_message.app,
                user_id  = client_message.id;

            if (!clients[app]) clients[app]={};

            socket.uid = user_id;
            clients[app][user_id]=socket;

            //remove from the unreg list
            var index = unreg_clients.indexOf(socket);
            if (index != -1) {
                unreg_clients.splice(index, 1);
                log('Client (id=' + socket.id + ') is vaild user now.');
            }

            socket.emit('info', '{"'+app+'":"connected"}');

        } catch (error) {
            log(error);
            log('client send invaild json format');
            return
        }

    })

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
    var push_list = clients['msd'];
    for (x in push_list) push_list[x].emit("info","this is message from server");
}, 2000);
