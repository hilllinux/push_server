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

var a = '{"app":"msd","id":1235","type":"broadcast","msg":"hello world"}'
var b = JSON.parse(a)
console.info(b.app)
