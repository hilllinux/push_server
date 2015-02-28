#! /bin/bash

path=/home/wangsongqing/push_server/
control_path=${path}/control.rb
log_path=${path}/log
ruby_bin=/usr/bin/ruby
result=`${ruby_bin} ${control_path} status | grep "no instances*" | wc -l`

if [ $result -ge 1 ]; then
    # 
    echo "`date` => no instance is running" >> ${log_path}
    echo "....start the ruby deamon"        >> ${log_path}
    # start the ruby daemon
    ${ruby_bin} ${control_path} start

    exit;
else
    exit;
fi
