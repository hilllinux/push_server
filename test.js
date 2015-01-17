/*
var a = '{"app":"msd","id":"12345"}'
try {
var b = JSON.parse(a)
var c = b.app;
var d = b.id;
var obj = {};
if(!obj[c]) obj[c]={};
obj[c][d]="123"
console.info(
obj[c][d]
)
} catch(error) {
  console.info(error)
}


*/

var redis = require("redis");

// redis 定义2个实例的原因:
// 一个实例若做了订阅操作，则无法读写缓存操作。
var redis_io     = redis.createClient('6379', '127.0.0.1');

redis_io.zset("key",1)
redis_io.lpop("key",function(item, value){

  console.info(value)

});
