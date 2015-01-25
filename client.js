var
    io = require('socket.io-client'),
//    ioClient = io.connect('http://121.40.192.185:3000');
//    ioClient = io.connect('http://test.yimood.com');
    ioClient = io.connect('http://localhost:3000');

var counter = 0;
ioClient.on('reg',function(msg){
    ioClient.emit('reg','{"app":"msd","id":"1234"}')
});

ioClient.on('info', function(msg) {
    console.info(msg);
//    counter++;
   // console.info(counter);
 //   if(counter == 4) {
        counter = 0;
        try {
          var aa = JSON.parse(msg);
          var app = "msd",
              mid = aa.mid;
        if ( !app || !mid) return;

          ioClient.emit('rev','{"app":"'+app+'","mid":"'+mid+'"}')
        } catch (error) {
          console.info(error);
        }
//    }

});

//ioClient.emit('mailto',"12","hello")
