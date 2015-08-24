require 'rubygems'
require 'daemons'

options = {
  :app_name   => "message_schedule",
  :backtrace  => true,
  :monitor    => true,
}

Daemons.run('/home/wangsongqing/message_schedule.rb', options )
