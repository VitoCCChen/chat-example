var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

var list = [];

var mysql      = require('mysql');
/*var connection = mysql.createConnection({
        "host": "localhost",
        "user": "root",
        "password": "",
        "database": "test"
    });
connection.connect();*/

var pool  = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "test"
});

pool.getConnection(function(err, connection) {
    // connected! (unless `err` is set)
});

//將聊天紀錄存入DB
function ChatLog(name, msg){
    //connection doent have to reconnet DB everytime
    //connection.connect();
    var table = 'chat';
    var data = { name: name, log: msg };
    var q = pool.query('INSERT INTO ?? SET ?', [table, data], function (error, results, fields) {
        //[try] to release
        //connection.release();

        if (error) throw error;
    });
    //console.log(q.sql);
    //connection.end();

    return q;
};

//將聊天紀錄存入DB
function ConnectLog(name){
    ChatLog(name, ' connected');
}

//將上線紀錄存入DB
function DisconnectLog(name){
    ChatLog(name, ' Disconnected');
}

function getlastindex(callback) {
    pool.query('SELECT COUNT(id) AS countrow FROM chat', function (error, results, fields) {
        if (error) throw error;

        console.log('row count '+ results[0].countrow);

        if(callback instanceof Function)  callback(results[0].countrow);
    });
}

//抓舊聊天紀錄
function getHistoryChat(callback){
    var lim = 10 ;

    //現在用不到兩層callback, 但先留著參考
    getlastindex( function(index){
        index -= lim;
        //pool.query('SELECT ?? FROM ?? LIMIT ? OFFSET ? ORDER BY ?? DESC',[['name', 'log'],'chat', lim, index, 'id'], function (error, results, fields) {
        pool.query('SELECT ?? FROM ?? ORDER BY ?? DESC LIMIT ?',[['name', 'log'],'chat', 'id', lim], function (error, results, fields) {
            if (error) throw error;

            if(callback instanceof Function)  callback(results);
        })
    });
}

function getListKey(targetvalue){
    for (var key in list) {
        var value = list[key];

        if(value == targetvalue)
            return key;
    }
    return -1;
}

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

//聆聽連結
io.on('connection', function(socket){
    var userinfo = {};
    var username = socket.handshake.query.name;

    //[try]deloye each room
    var program = [];
    /*if(roomList[program_id])
    {
        //chat room exist, do nothing
    }
    else {
        socket.on('program'+program_id, function(name, msg){
            console.log(name +' send messenge: '+msg);

            console.log( ChatLog(name, msg).sql + " function callback");

            io.emit('chat message', name, msg);
        });
    }*/

    //上線連線測試
    //console.log(username + ' connected into db with id: ' + pool.threadId);
    //ConnectLog(username);
    io.emit('connected', username+" is in, let's say hello!!");
    //[try]當重複名稱要求重新輸入
    /*if(onlineUser.indexOf(username) == -1)
    {
        console.log(username + ' connected');
        io.emit('connected', username+" is in, let's say hello!!");
    }
    else
    {
        console.log(socket.id + ' is changing name');
        io.sockets.connected[socket.id].emit('changename', username);
        return false;
    }*/

    //建立目前上線名單
    list[socket.id] = username;
    console.log(list);

    //[try]送給新user歷史紀錄
    var hisLog = [];
    getHistoryChat(function(results){
        hisLog = results;
        //console.log(hisLog);
        console.log(hisLog.length);

        io.sockets.connected[socket.id].emit('load history', hisLog);
    });

    //聆聽收到訊息
    socket.on('chat message', function(name, msg){
        console.log(name +' send messenge: '+msg);

        console.log( ChatLog(name, msg).sql + " function callback");

      io.emit('chat message', name, msg);
    });

    //聆聽誰正在輸入，目前只有show在web console
    socket.on('typing', function(name){
        //console.log(name +' chatting messenge: '+msg);
        io.emit('whoistyping', name);
    });

    //聆聽傳遞私訊
    socket.on('secret message', function(sender, target, msg){
        //console.log(sender +' send secret messenge to -> '+target);
        var targetId = getListKey(target);
        //console.log("get target key: "+getListKey(target));

        if(targetId != -1)
            io.sockets.connected[targetId].emit('chat message', sender, msg);
        else
        {
            msg = "can't find member \""+target+"\" online, please try again";
            console.log(msg);
            io.sockets.connected[socket.id].emit('chat message', '<system>', msg);
        }
    });

    //聆聽斷開鎖練
    socket.on('disconnect', function(){
        console.log(socket.id + ' disconnected');
        //DisconnectLog(list[socket.id]);
        io.emit('disconnected', list[socket.id]+" has leave us...");
        delete list[socket.id];
        console.log(list);
    });

    //聆聽DB莫名斷線
    pool.on('error', function(err) {
        if (!err.fatal) {
            return;
        }

        if (err.code !== 'PROTOCOL_CONNECTION_LOST') {
            throw err;
        }

        console.log('Re-connecting lost connection: ' + err.stack);


        pool = mysql.createPool({
            host: "localhost",
            user: "root",
            password: "",
            database: "test"
        });
        pool.getConnection(function(err, connection) {
            // connected! (unless `err` is set)
        });
    });
});

//設定websocket要聽哪一台
http.listen(port, function(){
  console.log('listening on *:' + port);
});
