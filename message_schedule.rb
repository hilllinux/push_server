# encoding: utf-8
require 'rubygems'
require 'redis'
require 'json'
require 'daemons'
require 'mysql' 

redis_obj  = Redis.new
Channel    = "msg"
Path       = "/home/wangsongqing/push_server/log"

# 时间设置
SLEEP_TIME          = 1
REDIS_WAIT_TIME     = 5
ORDER_DROP_TIME     = 300
MERCHANT_LEFT_TIME  = 300
FOOTMAN_LEFT_TIME   = 300

# 缓存前缀
USER_LIST           = "msd_user_list"
MESSAGE_LIST_PREFIX = "fm_push_list_"
ORDER_PREFIX        = "order_"
PUSH_LIST_PREFIX    = "push_list_"
MERCHART_LIST       = "msd_merchant_list"
FOOT_MAN_LIST       = "msd_footman_list"
USER_PREFIX         = "user_"

# 数据库信息
HOSTNAME            = "localhost"
DATABASE            = "mashangdao20150514"
USERNAME            = "root"
PASSWORD            = "1moodadmin"
PORT                = 3306

ORDER_BEEN_ROBED    = 1
# 消息重发设置
MSG_RESEND_LIST     = "pdl_resend_list"
RESEND_LIMIT        = 5
RESEND_TIME_EXPIRED = 60

# 写文件
def save_to_file path,message
    File.open(path, 'a') do |f|
    f.write(message)
    end
end

# 写日志模块
def log message
    message = "%s=>%s\n" % [Time.now, message]
    if nil then
        p message
    else
        save_to_file Path,message
    end
end

# 更新数据库，设置商家为下线状态
def set_merchat_to_offline merchant_id
    begin
        # connect to the   server
        dbh = Mysql.real_connect(HOSTNAME, USERNAME, PASSWORD, DATABASE, PORT)
        # get server version string and display it
        sql_state = "UPDATE tp_merchant SET online = 0 WHERE merchant_id = #{merchant_id}"
        log sql_state
        dbh.query(sql_state)
   rescue MysqlError => e
        log "mysql---->Error code: #{e.errno} \n     ---->Error message: #{e.error}"
    ensure
        # disconnect from server
        dbh.close
    end
end

# 更新缓存，设置镖师为下线状态
def set_foot_man_to_offline redis,user_id
    begin
        user_info = redis.get(%Q{#{USER_PREFIX}#{user_id}})
        if user_info then
            user_info_detail = JSON.parse(user_info)
            user_info_detail["online"] = 0
            redis.set(%Q{#{USER_PREFIX}#{user_id}},JSON.generate(user_info_detail))
        end
    rescue Exception => e
        log %Q{#{e.message} here 3 }
    end
end

def merchant_check redis
    #如果离线时间大于设置时间，则标识为离线
    begin
        redis.hkeys(MERCHART_LIST).each { |item|
            value = redis.hget(MERCHART_LIST, item)

            if value and value.to_i != 0 and value.to_i + MERCHANT_LEFT_TIME < Time.now.to_i then 
                log %Q{merchant(#{item}) is set to offline}
                set_merchat_to_offline item
                redis.hdel(MERCHART_LIST, item)
            end
        }
    rescue Exception => e
        log %Q{#{e.message} here 1 }
    end
end

def footman_check redis
    #如果离线时间大于设置时间，则标识为离线
    begin
        redis.hkeys(FOOT_MAN_LIST).each { |item|
            value = redis.hget(FOOT_MAN_LIST, item)

            if value and value.to_i != 0 and value.to_i + FOOTMAN_LEFT_TIME < Time.now.to_i then 
                log %Q{set footman (id=#{item}) to offline}
                set_foot_man_to_offline redis,item
                redis.hdel(FOOT_MAN_LIST, item)
            end
        }
    rescue Exception => e
        log %Q{#{e.message} here 2 }
    end
end

def show_online_status redis
    begin 
        if (Time.now.to_i % 5)==0 then
            merchant_nums = redis.hlen(MERCHART_LIST).to_i
            footman_nums  = redis.hlen(FOOT_MAN_LIST).to_i
            log(%Q{current merchant_nums (#{merchant_nums}) and footman_nums (#{footman_nums})})
        end

    rescue Exception =>e 
        log %Q{#{e.message} here 4 }
    end
end


# 消息重发逻辑
# 获取消息重发次数
# 最长延长时间 delay * time
def message_resend_handler redis
    begin 
        #时间发送间隔
        if (Time.now.to_i % 5) == 0 then

            redis.hkeys(MSG_RESEND_LIST).each { |item|

                json_value  = redis.hget(MSG_RESEND_LIST, item)
                json_detail = JSON.parse(json_value) if json_value
                next if not json_detail

                already_send_num = json_detail["sendtime"].to_i
                last_push_time   = json_detail['lasttime'].to_i

                if (already_send_num < RESEND_LIMIT) then 
                #if (last_push_time + RESEND_TIME_EXPIRED > Time.now.to_i )  then
                    log(%Q{resend time #{already_send_num+1}})
                    # 发送消息
                    redis.publish(Channel,json_value)
                else
                    log('reach resend limit, remove from resend list')
                    redis.hdel(MSG_RESEND_LIST,item)
                end

            }
            
        end

    rescue Exception =>e 
        log %Q{message resend error hanbend #{e.message}}
    end
end

# 本方法包含镖师抢单的业务逻辑
def message_check_and_send redis
    redis.lrange(USER_LIST,0,-1).each { |x|
        message_list_tag = %Q{#{MESSAGE_LIST_PREFIX}#{x}}
        len = redis.llen(message_list_tag)
        next if len == 0

        0.upto(len) {
            message = redis.lpop(message_list_tag) 
            begin
                # 消息解析
                message_detail = JSON.parse(message) if message
                next if not message_detail

                # 判断订单是否存在，不存在则移除该消息
                order = redis.get(%Q{#{ORDER_PREFIX}#{message_detail["order_id"]}})
                if not order then
                    log %Q{order (id=#{message_detail["order_id"]}) is not exists}
                    next
                end

                # 判断订单是否被抢，被抢则跳过消息
                order_detail = JSON.parse(order)
                if order_detail["state"].to_i == ORDER_BEEN_ROBED then
                    log %Q{order (id=#{message_detail["order_id"]}) is robed}
                    next
                end

                #到达发送时间
                push_time_foot_man = message_detail["push_time"].to_i
                if push_time_foot_man <= Time.now.to_i

                    # 如果镖师推送时间超过5分钟，则取消发送, 消息过期
                    next if Time.now.to_i > push_time_foot_man + ORDER_DROP_TIME

                    # 满足条件，推送消息
                    redis.publish(Channel,message)
                    # end 推送消息

                    # 更新镖师信息
                    log %Q{message (id= #{message_detail["mid"]}) has send to client (id=#{message_detail["user_id"]})}

                    # 更新缓存内消息
                    user_info = redis.get(%Q{#{USER_PREFIX}#{message_detail["user_id"]}})
                    if user_info then

                        user_info_detail = JSON.parse(user_info)
                        user_info_detail["last_push_time"] = Time.now.to_i
                        log %Q{update the pushtime of user (id=#{message_detail["user_id"]})}
                        redis.set(%Q{#{USER_PREFIX}#{message_detail["user_id"]}},JSON.generate(user_info_detail))
                        redis.rpush(%Q{#{PUSH_LIST_PREFIX}#{message_detail['order_id']}}, message_detail['user_id'])

                    end

                    break #推送成功，进入下一条发送间隔

                else

                    # 消息未达到推送时间，压入推送列表
                    redis.rpush(message_list_tag,message)
                    log %Q{message (id=#{message_detail["mid"]}) push back to list}

                end

            rescue Exception => e

                log %Q{#{e.message} here 5 }
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
        # 输出在线情况
        show_online_status redis_obj
        # 消息重发列表
        # message_resend_handler redis_obj

    rescue Exception => e
        log e.message
        sleep SLEEP_TIME
        retry
    end

    # 减少服务器压力，休息1s
    sleep SLEEP_TIME
end
