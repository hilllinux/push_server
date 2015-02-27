require 'daemons'

#Daemons.run('message.rb')

def custom_show_status(app)
      # Display the default status information
    app.default_show_status
    puts
    puts "PS information"
    system("ps -p #{app.pid.pid.to_s}")

    puts
    puts "Size of log files"
    system("du -hs /home/wangsongqing/push_server/message_log")
end

Daemons.run('message.rb', { show_status_callback: :custom_show_status })
