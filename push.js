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

log('SocketIO 开始监听3000端口');


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

    log("redis 连接成功");
    // redis 订阅 msg 这个频道，后期需要将频道设置成配置项
    redis_sub_event_handler.subscribe("msg");

})

redis_sub_event_handler.on("message", function(channel, msg){

    log("收到即时推送请求,消息内容: "+msg);

    // 解析正常格式的 JSON 数据.
    try {
        var obj = JSON.parse(msg);
        var id     = obj.user_id,
            mid    = obj.mid,
            app    = obj.app,
            info   = obj.msg;

        // 为安卓客户端构造Json 格式的消息
        //var info   = '{"mid":"'+mid+'","msg":"'+obj.msg+'"}';

        if (!id || !mid || !info || !app) {

            log("JSON 格式不完整");
            return ;

        }


        // 用户不在线
        if (!clients[app][id]) {

            if ('pdl' == app) {

                redis_io.rpush(app+"_"+"resend_list", msg)
                log("["+app+"]的用户:(id=" + id+")不在线，加入到重发列表");

            } else {

                log("["+app+"]的用户:(id=" + id+")不在线，推送失败");

            }
            // 消息发送失败原因写入缓存;
            // redis_io.set("msg_"+app+"_"+mid,'{"status":"faild","reason":"not alive"}',redis.print)
            return;

        }

        info = JSON.stringify(info);
        // 即时消息推送
        log("向["+app+"]的用户(id="+id+")推送消息:"+info);

        try {

            clients[app][id].emit('info',info);

        } catch (error) {
            // 发送失败，加入到重发列表
            if (app == "msd") {
                log("["+app+"]用户(id="+id+") 不在线，加入到重发列表:"+msg);
            }

        }

        //点对点消息状态写入缓存操作;
        //redis_io.set("msg_"+app+"_"+mid,'{"status":"sent"}',redis.print)

        // 将消息写到消息队列中; 如成功接收到APP客户端的反馈，则移除；
        // 后续在定时器中添加，满n 次推送未收到反馈移除该消息的逻辑
        if (!(message_query["msg_"+app+"_"+mid])) {

            var message_item        = {}
            message_item["msg"]     = msg;
            message_item["counter"] = 0;
            message_query["msg_"+app+"_"+mid] = message_item;
            
        }


    } catch (error) {

        log(error);
        log("即时消息推送请求的 JSON 格式错误");
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
    log('有新的socket链接:(' + socket.id + ').');

    // 新的 socket 登入，检测是否是已经注册的，否则通知注册；
    if (!socket.uid) {

        log("用户未注册");
        // 将 socket 实例加入到未注册列表中;
        unreg_clients.push(socket);
        // 消息推送到客户端提醒注册；
        socket.emit('reg','{"msg":"unreg"}');

    }

    // APP 端用户socket 和 client ID 绑定流程；
    // 消息格式：{"app":"msd","id":"123"}
    socket.on('reg', function(message){
        log("收到APP用户注册请求"+message);
        
        if(socket.uid) { 

            log("["+socket.app+"]用户("+socket.uid+")已经注册") 
            socket.emit('reg', '{"msg":"connected"}');
            return;

        }

        try {

            var client_message = JSON.parse(message);
            var user_id  = client_message.id,
                app      = client_message.app,
                role_type= client_message.role;

            if (!user_id || !app) {

                log("JSON 格式不完整 2");
                return ;

            }

            if (role_type) {
                // e.g. redis.hset(msd_fm_list , 7000, 0)
                redis_io.hset(app+"_"+role_type+"_list", user_id, 0);
                socket.role = role_type;

            }

            socket.uid = user_id;
            socket.app = app;

            // 将用户ID 增加到在线列表中
            if (!clients[app]) clients[app]={};
            if (!clients[app][user_id]) redis_io.rpush(app+"_user_list",user_id);
            clients[app][user_id]=socket;

            // 从未注册列表中删除已注册的socket 实例
            var index = unreg_clients.indexOf(socket);
            if (index != -1) {

                unreg_clients.splice(index, 1);
                log("["+app+"]的用户(id="+socket.uid+")注册成功");

            }

            // 消息推送客户端注册成功；
            socket.emit('reg', '{"msg":"connected"}');

        } catch (error) {

            log(error);
            log("APP注册请求的JSON格式不正确");
            return;

        }

    })

    // APP 消息已送到  事件处理逻辑
    // 消息队列中移除已发送的消息
    // 缓存中标记 该消息已经送达客户端
    socket.on('rev', function(message){

        try {

            var client_message = JSON.parse(message);
            var mid      = client_message.mid,
                app      = client_message.app;

            if (!mid || !app) {
                log("JSON 格式不完整 3");
                return ;
            }

            log("收到["+app+"]用户(id="+socket.uid+") 对消息(mid_"+mid+")确认请求");
            // 消息队列中移除已发送的消息
            delete message_query["msg_"+app+"_"+mid];
            // 缓存中更新消息状态
            //redis_io.set("msg_"+app+"_"+mid,'{"status":"recived"}',redis.print)

        } catch (error) {

            log(error);
            log("APP消息确认请求的JSON格式不正确");
            return;

        }

    })

    // APP 地址事件
    // 镖师端上传地址坐标或者客户端获取当前镖师地理位置
    socket.on('loc', function loc_event(message) {

        log("收到[" + app + "]用户(id=" + socket.uid + " loc 事件" + message);

        try {

            var message_json = JSON.parse(message);
            var type         = message_json.type;
            var foot_man_id  = message_json.id;
            //var role         = message_json.role; //扩展属性

            // get为用户获取镖师坐标
            // set为镖师上传坐标
            if (type == 'get') {

                if (foot_man_id) {

                    redis_io.get('user_'+foot_man_id, function redis_get_handler(reply, err) {

                        socket.emit('loc', reply);

                    }
                }

            } else if (type == 'set') {

                var lon = message_json.lon;
                var lat = message_json.lat;

                //获取当前数据
                if (lan && lat) {
                    redis_io.get('user_'+foot_man_id, function redis_get_handler(reply, err) {

                        try {

                            var json_data = JSON.parse(reply);
                            json_data.longitude = lon;
                            json_data.latitude  = lan;
                            redis_io.set('user_'+foot_man_id, JSON.stringify(json_data), redis.print);

                        } catch (error) {

                            log("redis get触发错误事件，错误原因如下:");
                            log(error)

                        }
                    }
                }

            }

        } catch (error) {

            log("loc 事件触发错误事件，错误原因如下:");
            log(error);

        }
    
    }

    // 收到APP掉线事件，将 socket 实例列表删除已下线的socket.
    socket.on('disconnect', function() {
        try{
            // socket 未注册，直接退出逻辑
            if (!socket.uid || !socket.app) return;
            // 获取列表中socket
            var socket_in_list = clients[socket.app][socket.uid]

            // 如果 socket id 不相等，则是新的 socket 进来
            if (socket_in_list.id  && socket_in_list.id != socket.id) return;

            if (socket.uid) {

                delete clients[socket.app][socket.uid];
                redis_io.lrem(socket.app+"_user_list",0,socket.uid,redis.print);
                log("["+socket.app+"]的用户(id="+socket.uid+")已经离线");

                if (socket.role) {

                    //角色离线，更新离线时间
                    var myDate=new Date();
                    var value = myDate.getTime()/1000;
                    redis_io.hset(socket.app+"_"+socket.role+"_list",socket.uid, value);

                }

            }

        } catch (error) {

            log(error);
            return

        }
    });

});

/*
 * 重新发送逻辑
 */
function resend_message_to_client(msg_index) {

    var counter = message_query[msg_index]["counter"];
    if (counter == 5) {

        message_query[msg_index]["counter"] = 0;
        delete message_query[msg_index];
        return;
    }

    try {

        var obj = JSON.parse(message_query[msg_index]["msg"]);
        var id     = obj.user_id,
            app    = obj.app,
            info   = JSON.stringify(obj.msg),
            mid    = obj.mid;

        if (clients[app][id]) {

            log("重新发送消息到["+app+"]用户(id="+id+"), 当前第("+counter+")次");
            clients[app][id].emit('info',info);
            // 重发次数累加
            counter++;
            message_query[msg_index]["counter"] = counter;

        } else {

            log("["+app+"]的用户("+id+")不在线，推送失败");
            // 用户不在线，删除推送消息对象
            // delete message_query[msg_index];

            // 消息发送失败原因写入缓存;
            //redis_io.set("msg_"+app+"_"+mid,'{"status":"faild","reason":"not alive"}',redis.print)
        }

    } catch(error) {

        log("重发失败");
        log(error);

    }
}

/*
 * Desc:
 * 定时器：定时要处理的业务逻辑
 * 定时的时间间隔将作为配置项处理
 */

setInterval(function() { 
    // 通知未注册用户注册
    for(x in unreg_clients) unreg_clients[x].emit("reg",'{"msg":"unreg"}');
    // 未送达消息重发逻辑
//    for(x in message_query) resend_message_to_client(x);
//    var push_list = clients;
//    for (x in push_list) push_list[x].emit("info",'{"msg":"this is message from server"}');
    // 时间可以配置
}, 2000);

