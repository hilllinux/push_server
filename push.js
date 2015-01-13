// 端口号后期需要修改成配置文件的形式
var io = require('socket.io'),
    ioServer = io.listen(3000),
    clients = {},
    message_query = {},
    unreg_clients = [];

var redis = require("redis");

// redis 定义2个实例的原因:
// 一个实例若做了订阅操作，则无法读写缓存操作。
var redis_client = redis.createClient('6379', '127.0.0.1');
var redis_io     = redis.createClient('6379', '127.0.0.1');

/*
 * 打印函数设置
 * 如果debug 有定义，则输出log,
 * 否则无log 输出
 *
 */

var debug = 1;
function log(msg){
    if (!debug) return;

    var date = new Date(); 
    console.info(date+" --> "+msg);
}

log('SocketIO > listening on port :3000');

/* 
 * Desc:
 * 这个逻辑块主要处理来至 PHP 端的消息；
 * 主要通过 redis 的 pub/sub 功能实现 PHP 端到 nodejs 的实时消息推送;
 *
 * 接口说明
 * id   : user_id.
 * app  : the app that the message will be forward.
 * type : p2p or broadcast to clients
 * mid  : message id
 * msg  : mssage will be send to client.
 *
 * 接口示例 : {"id":"123","app":"msd","type":"single","msg":"hello world"}
 */

redis_client.on("ready", function() {
    log("redis is ready");
    // redis 订阅 msg 这个频道，后期需要将频道设置成配置项
    redis_client.subscribe("msg");

})

redis_client.on("message", function(channel, msg){
    log(channel+":"+msg);

    // 解析正常格式的 JSON 数据.
    try {
        var obj = JSON.parse(msg);
        var id     = obj.id,
            app    = obj.app,
            mid    = obj.mid,
            type   = obj.type;


        if (!id || !app || !type || !mid || !(obj.msg)) {
            log("paramter is not complete!")
            return ;
        }

        log(mid+app);

        if (!(message_query[app+"_"+mid])) message_query[app+"_"+mid] = msg;

        // 为安卓客户端构造Json 格式的消息
        var info   = '{"mid":"'+mid+'","msg":"'+obj.msg+'"}';


        // 发送消息
        // 按应用群发或者按应用点对点发送，取决于PHP 传过来的消息类型;
        if (app && type == 'broadcast') {
            var push_list = clients[app];
            for (x in push_list) push_list[x].emit("info",info);

            //群发的消息状态写入缓存操作;
            redis_io.set(app+"_"+mid,'{"status":"sent"}',redis.print)

        } else if (clients[app][id]) {
            clients[app][id].emit('info',info);

            //点对点消息状态写入缓存操作;
            redis_io.set(app+"_"+mid,'{"status":"sent"}',redis.print)

        } else {
            log("user: " + id+" is not online!");

            // 消息发送失败原因写入缓存;
            redis_io.set(app+"_"+mid,'{"status":"faild","reason":"not alive"}',redis.print)

        }

    } catch (error) {
        log(error);
        log("PHP send invaild json fromat");
        return;
    }
});

/*
 * Desc:
 * 这个逻辑块主要处理来自 APP 端的消息事件
 * 例如： 注册，消息成功接收等；
 *
 * nodejs 和 APP 直接的数据统一使用Json 格式;
 *
 */

ioServer.sockets.on('connection', function(socket) {
    log('New client connected (id=' + socket.id + ').');

    // 新的 socket 登入，检测是否是已经注册的，否则通知注册；
    if (!socket.uid) {
        log("unreg ueser login!");
        // 将 socket 实例加入到未注册列表中;
        unreg_clients.push(socket);
        // 消息推送到客户端提醒注册；
        socket.emit('info','{"msg":"unreg"}');
    }

    // APP 端用户socket 和 client ID 绑定流程；
    // 消息格式：{"app":"msd","id":"123"}
    socket.on('reg', function(message){
        log(socket.id+":"+message);

        try{
            var client_message = JSON.parse(message);
            var app      = client_message.app,
                user_id  = client_message.id;

            if (!clients[app]) clients[app]={};

            socket.uid = user_id;
            clients[app][user_id]=socket;

            // 从未注册列表中删除已注册的socket 实例
            var index = unreg_clients.indexOf(socket);
            if (index != -1) {
                unreg_clients.splice(index, 1);
                log('Client (id=' + socket.id + ') is vaild user now.');
            }

            // 消息推送客户端注册成功；
            socket.emit('info', '{"msg":"connected"}');

        } catch (error) {
            log(error);
            log('client send invaild json format');
            return
        }

    })

    // APP 消息已送到  事件处理逻辑
    // 消息队列中移除已发送的消息
    // 缓存中标记 该消息已经送达客户端
    socket.on('rev', function(message){
        log(socket.id+":"+message);

        try{
            var client_message = JSON.parse(message);
            var app      = client_message.app,
                mid      = client_message.mid;

            redis_io.set(app+"_"+mid,'{"status":"recived"}',redis.print)

        } catch (error) {
            log(error);
            log('client send invaild json format');
            return
        }

    })


    // 收到APP掉线事件，将 socket 实例列表删除已下线的socket.
    socket.on('disconnect', function() {
        delete clients[socket.uid];
        log('Client gone (id=' + socket.uid + ').');
    });

});

/*
 * Desc:
 * 定时处理逻辑
 * 定时的时间间隔将作为配置项处理
 */

setInterval(function() { 
    // 通知未注册用户注册
    for(x in unreg_clients) unreg_clients[x].emit("info",'{"msg":"unreg"}');
    // 未送达消息重发逻辑

}, 2000);

// timer set for push info to clients
//setInterval(function() {
//    var push_list = clients['msd'];
//    for (x in push_list) push_list[x].emit("info",'{"msg":"this is message from server"}');
//}, 2000);
