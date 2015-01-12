var
    io = require('socket.io-client'),
    ioClient = io.connect('http://localhost:3000');

ioClient.on('info', function(msg) {
    console.info(msg);
    try {
      var aa = JSON.parse(msg);
      var app = "msd",
          mid = aa.mid;
    if ( !app || !mid) return;

      ioClient.emit('rev','{"app":"'+app+'","mid":"'+mid+'"}')
      console.info("snd");
    } catch (error) {
      console.info(error);
    }

});

ioClient.emit('reg','{"app":"msd","id":"1235"}')
//ioClient.emit('mailto',"12","hello")
