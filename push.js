// 端口号后期需要修改成配置文件的形式
var io = require('socket.io'),
    ioServer = io.listen(3000),
    clients = {},
    message_query = {},
    unreg_clients = [];

var redis = require("redis");

// redis 定义2个实例的原因:
// 一个实例若做了订阅操作，则无法读写缓存操作。
var redis_sub_event_handler = redis.createClient('6379', '127.0.0.1');
var redis_io                = redis.createClient('6379', '127.0.0.1');

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
 * time : 推送时间.
 * mid  : message id
 * msg  : 送达到app的消息体
 *
 * 接口示例 : {"user_id":"123","push_time":"0","msg":"hello world"}
 */

redis_sub_event_handler.on("ready", function() {
    log("redis is ready");
    // redis 订阅 msg 这个频道，后期需要将频道设置成配置项
    redis_sub_event_handler.subscribe("msg");

})

redis_sub_event_handler.on("message", function(channel, msg){

    log(channel+":"+msg);

    // 解析正常格式的 JSON 数据.
    try {
        var obj = JSON.parse(msg);
        var id     = obj.user_id,
            mid    = obj.mid,
            info   = obj.msg,
            time   = obj.push_time;

        // 为安卓客户端构造Json 格式的消息
        //var info   = '{"mid":"'+mid+'","msg":"'+obj.msg+'"}';

        if (!id || !time || !mid || !info) {
            log("paramter is not complete!")
            return ;
        }


        // 用户不在线
        if (!clients[id]) {
            log("user: " + id+" is not online!");
            // 消息发送失败原因写入缓存;
            redis_io.set("msg_"+mid,'{"status":"faild","reason":"not alive"}',redis.print)
        }

        // 即时消息推送
        if (0==parseInt(time)) {
            clients[id].emit('info',info);

            //点对点消息状态写入缓存操作;
            redis_io.set("msg_"+mid,'{"status":"sent"}',redis.print)

            //更新镖师发送时间
            redis_io.get("user_"+id,function(item,user_info){ 
                if(user_info) {
                    var c_date   = new Date();
                    user_info = JSON_parse(user_info);
                    user_info.last_push_time = c_date.getTime();
                    // 缓存中更新
                    redis_io.set("user_"+id,JSON.stringify(user_info));
                }
            });

            // 将消息写到消息队列中; 如成功接收到APP客户端的反馈，则移除；
            // 后续在定时器中添加，满n 次推送未收到反馈移除该消息的逻辑
            if (!(message_query["msg_"+mid])) message_query["msg_"+mid] = msg;

        } else {
            // 缓存消息队列中；
            // 每个用户维护缓存队列
            log(msg+" is cached to user:" + id);
            redis_io.rpush("message_list_"+id,msg);
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
            var user_id  = client_message.id;

            socket.uid = user_id;
            clients[user_id]=socket;

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
            var mid      = client_message.mid;

            // 消息队列中移除已发送的消息
            delete message_query["msg_"+mid];
            // 缓存中更新消息状态
            redis_io.set("msg_"+mid,'{"status":"recived"}',redis.print)

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
 * 重新发送逻辑
 */
function resend_message_to_client(msg_index) {
    try{

        log("resend:"+message_query[msg_index]);

        var obj = JSON.parse(message_query[msg_index]);
        var id     = obj.user_id,
            info   = obj.msg,
            mid    = obj.mid;

        if (clients[id]) {
            clients[id].emit('info',info);
            // counter++

        } else {
            log("user: " + id+" is not online!");

            // 用户不在线，删除推送消息对象
            delete message_query["msg_"+mid];

            // 消息发送失败原因写入缓存;
            redis_io.set("msg_"+mid,'{"status":"faild","reason":"not alive"}',redis.print)
        }
    } catch(error) {

        log("重发失败");
        log(error);
    }
}

function message_handler(item, message) {
    log("message_handler:"+message);
    var obj = JSON.parse(message);
    var c_date = new Date();
    var c_time = c_date.getTime();

    var id     = obj.user_id,
        info   = obj.msg,
        time   = obj.push_time,
        o_id   = obj.order_id,
        mid    = obj.mid;

    redis_io.get("order_"+o_id,function(item,state){

        if (!state) return;
        if (parseInt(state) == 1) return; //订单被抢；

        if (parseInt(time) > parseInt(c_time)) {
            redis_io.rpush("message_list_"+id, message); // 时间未到；
            return;
        }

        // 如果订单未被抢，推送消息
        clients[id].emit('info',info);
        //点对点消息状态写入缓存操作;
        redis_io.set("msg_"+mid,'{"status":"sent"}',redis.print)
        //更新镖师发送时间
        redis_io.get("user_"+id,function(item,user_info){ 
            if(user_info) {
                var c_date   = new Date();
                user_info = JSON_parse(user_info);
                user_info.last_push_time = c_date.getTime();
                // 缓存中更新
                redis_io.set("user_"+id,JSON.stringify(user_info));
            }
        });

        // 将消息写到消息队列中; 如成功接收到APP客户端的反馈，则移除；
        // 后续在定时器中添加，满n 次推送未收到反馈移除该消息的逻辑
        if (!(message_query["msg_"+mid])) message_query["msg_"+mid] = message;
    });

    return 1;
}
/*
 * Desc:
 * 定时器：定时要处理的业务逻辑
 * 定时的时间间隔将作为配置项处理
 */


setInterval(function() { 
    var push_list = clients;
    for (x in push_list){ 
        var socket = push_list[x];
        var id  = socket.uid;

        var length = 0;
        redis_io.llen("message_list_"+id, function(item,value){ 
            length = parseInt(value);
            log(length)

            for (var i = 0;i < length; i++ ) {
                redis_io.lpop("message_list_"+id, message_handler(item,value));
            } 
        });
    }
    // 时间可以配置
}, 1000);

setInterval(function() { 
    // 通知未注册用户注册
    for(x in unreg_clients) unreg_clients[x].emit("info",'{"msg":"unreg"}');
    // 未送达消息重发逻辑
    for(x in message_query) resend_message_to_client(x);
//    var push_list = clients;
//    for (x in push_list) push_list[x].emit("info",'{"msg":"this is message from server"}');
}, 2000);

