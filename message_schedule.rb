require 'rubygems'
require 'redis'
require 'json'
require 'daemons'

redis      = Redis.new
Channel    = "msg"
Path       = "/Users/wsq/workspace/nodjs/push_server/log"
SLEEP_TIME = 1
REDIS_WAIT_TIME     = 5
user_list_tag       = "msd_user_list"
message_list_prefix = "fm_push_list_"
order_prefix        = "order_"
push_list_prefix    = "push_list_"

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

loop do
    # 对 redis 做心跳检测，异常则挂起
    begin
        redis.ping
    rescue Exception => e
        log e.message
        sleep REDIS_WAIT_TIME
        next
    end

    # 主逻辑
    redis.lrange(user_list_tag,0,-1).each { |x|
        message_list_tag = %Q{#{message_list_prefix}#{x}}
        len = redis.llen(message_list_tag)
        next if len == 0

        0.upto(len) {
            message = redis.lpop(message_list_tag) 
            begin
                message_detail = JSON.parse(message) if message
                next if not message_detail

                # 订单不存在或者订单状态被抢，则移除该消息
                order = redis.get(%Q{#{order_prefix}#{message_detail["order_id"]}})
                if not order then
                    log %Q{order (id=#{message_detail["order_id"]}) is not exists}
                    next
                end

                order_detail = JSON.parse(order)
                if order_detail["state"].to_i == 1 then
                    log %Q{order (id=#{message_detail["order_id"]}) is robed}
                    next
                end

                if message_detail["push_time"].to_i <= Time.now.to_i 
                    redis.publish(Channel,message)
                    # 更新镖师信息
                    log %Q{message (id= #{message_detail["mid"]}) has send to client (id=#{message_detail["user_id"]})}

                    user_info = redis.get(%Q{user_#{message_detail["user_id"]}})
                    if user_info then
                        user_info_detail = JSON.parse(user_info)
                        user_info_detail["push_time"] = Time.now.to_i
                        log %Q{update the pushtime of user (id=#{message_detail["user_id"]})}
                        redis.set(%Q{user_#{message_detail["user_id"]}},JSON.generate(user_info_detail))
                        redis.rpush(%Q{#{push_list_prefix}#{user_info_detail['order_id']}},%Q{#{user_info_detail['user_id']}})
                    end
                    break
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

    # 减少服务器压力，休息1s
    sleep SLEEP_TIME 
end
