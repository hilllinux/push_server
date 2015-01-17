require 'redis'
require 'json'
require 'daemons'

user_list_tag = "user_list"
message_list_prefix = "message_list_"
order_prefix = "order_"
Channel = "msg"

redis = Redis.new

loop do
    redis.lrange(user_list_tag,0,-1).each { |x|
        message_list_tag = %Q{#{message_list_prefix}#{x}}
        len = redis.llen(message_list_tag)
        next if len == 0
        
        0.upto(len) {
            message = redis.lpop(message_list_tag) 
            begin
                message_detail = JSON.parse(message) if message
                next if not message_detail
                p message_detail

                # 订单不存在或者订单状态被抢，则移除该消息
                order = redis.get(%Q{#{order_prefix}#{message_detail["order_id"]}})
                next if not order
                order_detail = JSON.parse(order)
                next if order_detail["state"].to_i == 1

            rescue JSON::ParserError,SystemCallError
                p "json format error"
                next
            end

            if message_detail["push_time"].to_i <= Time.now.to_i 
                redis.publish(Channel,message)
                p "messsage sent to client"
                break
            else
                redis.rpush(message_list_tag,message)
                p "push back to list"
            end
        }
    }

    # 减少服务器压力，休息1s
    sleep(1)
end
