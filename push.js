var
    io = require('socket.io'),
    ioServer = io.listen(8000, function(){
        console.info("start listening at port 8000")
    }),
    sequence = 1;
var clients = {};

var redis = require("redis");
var redis_client = redis.createClient('6379', '127.0.0.1');

redis_client.on("error", function(err) {
    console.log("Error" + err);
})

//redis test
//redis_client.set("client_123", "test", redis.print);
//redis_client.get("client_123", redis.print);

// Event fired every time a new client connects:
ioServer.sockets.on('connection', function(socket) {
    console.info('New client connected (id=' + socket.id + ').');

    socket.on('reg', function(message){
        console.log(socket.id+" : "+message);
        //clients[socket.id]=socket;
        clients[message] = socket;
        //redis_client.set('client_'+message, socket.id, redis.print);
        socket.emit('foo',"welcome:" + message);
        socket.broadcast.emit('foo', message+" have joined us");
    })

    socket.on('mailto', function(userid,message){
        if (clients[userid]) clients[userid].emit('foo',message);
        else socket.emit('foo', "mailto "+userid+" failed!");
    });

    // When socket disconnects, remove it from the list:
    socket.on('disconnect', function() {
        /*var index = clients.indexOf(socket);
        if (index != -1) {
            clients.splice(index, 1);
            console.info('Client gone (id=' + socket.id + ').');
        }
        */
        console.info('Client gone (id=' + socket.id + ').');
    });
});

/*
// Every 1 second, sends a message to a random client:
setInterval(function() {
    var randomClient;
    if (clients.length > 0) {
        randomClient = Math.floor(Math.random() * clients.length);
        clients[randomClient].emit('foo', sequence++);
    }
}, 1000);
*/
