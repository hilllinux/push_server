require 'rubygems'
require 'redis'
require 'json'
require 'daemons'
require 'mysql' 

redis_obj  = Redis.new
Channel    = "msg"
Path       = "./log"

# 时间设置
SLEEP_TIME          = 1
REDIS_WAIT_TIME     = 5
ORDER_DROP_TIME     = 300
MERCHANT_LEFT_TIME  = 300

# 缓存前缀
USER_LIST           = "msd_user_list"
MESSAGE_LIST_PREFIX = "fm_push_list_"
ORDER_PREFIX        = "order_"
PUSH_LIST_PREFIX    = "push_list_"
MERCHART_LIST       = "msd_merchant_list"
FOOT_MAN_LIST       = "msd_foot_man_list"

# 数据库信息
HOSTNAME            = "localhost"
DATABASE            = "mashangdao"
USERNAME            = "root"
PASSWORD            = "1moodadmin"
PORT                = 3306

def save_to_file path,message
    File.open(path, 'a') do |f|
    f.write(message)
    end
end

def log message
    message = "%s=>%s\n" % [Time.now, message]
    if nil then
        p message
    else
        save_to_file Path,message
    end
end

def set_merchat_to_offline merchat_id
    begin
        # connect to the   server
        dbh = Mysql.real_connect(HOSTNAME, USERNAME, PASSWORD, DATABASE, PORT)
        # get server version string and display it
        sql_state = "UPDATE tp_merchant SET online = 0 WHERE merchant_id = #{merchant_id}"
        dbh.query(sql_state)
    rescue MysqlError => e
        log "mysql---->Error code: #{e.errno} \n     ---->Error message: #{e.error}"
    ensure
        # disconnect from server
        dbh.close
    end
end

def set_foot_man_to_offline redis,foot_man_id
    begin
    end
end

def merchant_check redis
    #如果离线时间大于设置时间，则标识为离线
    redis.hkeys.each { |item|
        value = redis.hget(MERCHART_LIST, item)
        if value && value.to_i + MERCHANT_LEFT_TIME < Time.now.to_i then 
            set_merchat_to_offline item
        end
    }
end

def footman_check redis
end

def message_check_and_send redis
    redis.lrange(USER_LIST,0,-1).each { |x|
        message_list_tag = %Q{#{MESSAGE_LIST_PREFIX}#{x}}
        len = redis.llen(message_list_tag)
        next if len == 0

        0.upto(len) {
            message = redis.lpop(message_list_tag) 
            begin
                message_detail = JSON.parse(message) if message
                next if not message_detail

                # 订单不存在或者订单状态被抢，则移除该消息
                order = redis.get(%Q{#{ORDER_PREFIX}#{message_detail["order_id"]}})
                if not order then
                    log %Q{order (id=#{message_detail["order_id"]}) is not exists}
                    next
                end

                order_detail = JSON.parse(order)
                if order_detail["state"].to_i == 1 then
                    log %Q{order (id=#{message_detail["order_id"]}) is robed}
                    next
                end

                push_time_foot_man = message_detail["push_time"].to_i
                #到达发送时间
                if push_time_foot_man <= Time.now.to_i
                #if message_detail["push_time"].to_i <= Time.now.to_i 
                    # 如果镖师推送时间超过5分钟，则取消发送, 消息过期
                    next if Time.now.to_i > push_time_foot_man + ORDER_DROP_TIME
                    redis.publish(Channel,message)
                    # 更新镖师信息
                    log %Q{message (id= #{message_detail["mid"]}) has send to client (id=#{message_detail["user_id"]})}

                    user_info = redis.get(%Q{user_#{message_detail["user_id"]}})
                    if user_info then
                        user_info_detail = JSON.parse(user_info)
                        user_info_detail["last_push_time"] = Time.now.to_i
                        log %Q{update the pushtime of user (id=#{message_detail["user_id"]})}
                        redis.set(%Q{user_#{message_detail["user_id"]}},JSON.generate(user_info_detail))
                        redis.rpush(%Q{#{PUSH_LIST_PREFIX}#{message_detail['order_id']}}, message_detail['user_id'])
                    end
                    break #推送成功，进入下一条发送间隔
                else
                    redis.rpush(message_list_tag,message)
                    log %Q{message (id=#{message_detail["mid"]}) push back to list}
                end

            rescue Exception => e
                log e.message
                next
            end
        }
    }
end

log %Q{service start}
# 主逻辑
loop do
    # 对 redis 做心跳检测，异常则挂起
    begin
        redis_obj.ping
    rescue Exception => e
        log e.message
        sleep REDIS_WAIT_TIME
        next
    end

    begin
        # 消息推送逻辑
        message_check_and_send redis_obj
        # 镖师在线检测
        footman_check  redis_obj
        # 商户在线检测
        merchant_check redis_obj

    rescue Exception => e
        log e.message
        sleep SLEEP_TIME
        retry
    end

    # 减少服务器压力，休息1s
    sleep SLEEP_TIME
end
