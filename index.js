var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;
const low = require('lowdb');
const Memory = require('lowdb/adapters/Memory');
const db = low(new Memory);
//db.defaults({ rooms: [] }).write();

var userinfo = [];
var roomList = [];

var mysql      = require('mysql');

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
function ChatLog(name, msg, room){
    //connection doent have to reconnet DB everytime
    //connection.connect();
    var table = 'chat';
    var data = { name: name, log: msg, room: room};
    var q = pool.query('INSERT INTO ?? SET ?', [table, data], function (error, results, fields) {
        //[try] to release
        //connection.release();

        if (error) throw error;
    });
    //console.log(q.sql);
    //connection.end();

    db.get('room'+room).push({ name: name, log: msg}).write();
    //console.log(db.get('room'+room).value());

    return q;
}

//將上線紀錄存入DB
function ConnectLog(name, room){
    ChatLog(name, ' connected', room);
}

//將離線紀錄存入DB
function DisconnectLog(name, room){
    ChatLog(name, ' Disconnected', room);
}

function getlastindex(callback){
    pool.query('SELECT COUNT(id) AS countrow FROM chat', function (error, results, fields) {
        if (error) throw error;

        //console.log('row count '+ results[0].countrow);

        if(callback instanceof Function)  callback(results[0].countrow);
    });
}

//抓舊聊天紀錄
function getHistoryChat(room, callback){
    var lim = 10 ;
    console.log('room in function', room);

    //現在用不到兩層callback, 但先留著參考
    getlastindex( function(index){
        index -= lim;
        //pool.query('SELECT ?? FROM ?? LIMIT ? OFFSET ? ORDER BY ?? DESC',[['name', 'log'],'chat', lim, index, 'id'], function (error, results, fields) {
        //pool.query('SELECT ?? FROM ?? WHERE ??=? ORDER BY ?? DESC LIMIT ?',[['name', 'log'],'chat', 'room', room, 'id', lim], function (error, results, fields) {
        pool.query('SELECT ?? FROM ?? WHERE ??=?',[['name', 'log'],'chat', 'room', room], function (error, results, fields) {
            if (error) throw error;

            if(callback instanceof Function)  callback(results);
        })
    });
}

//以value抓取array的key值
function getListKey(targetvalue){
    for (var key in userinfo) {
        var value = userinfo[key];

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
    var username = socket.handshake.query.name;
    var userroom;

    //建立目前上線名單，不分房間
    userinfo[socket.id] = username;
    console.log(userinfo);

    //分配房間，並show該房間歷史紀錄
    socket.on('create', function(room) {
        socket.join(room);
        console.log("created room: ",room);
        userroom = room;

        var roomisNew = false;
        if(roomList.indexOf(room) == -1)
        {
            roomisNew = true;
            roomList.push(room);
        }

        //ConnectLog(username, userroom);

        //[try]送給新user歷史紀錄
        var hisLog = [];

        if(roomisNew){
            getHistoryChat(userroom, function(results){
                db.set('room'+userroom, results).write();
                hisLog = db.get('room'+userroom).value();

                console.log('log from mysql');
                //console.log('log form mysql ',hisLog);
                //console.log('value: ', db.get('posts').value());
                //console.log(hisLog.length);

                io.sockets.connected[socket.id].emit('load history'+userroom, hisLog);
            });
        }
        else{
            hisLog = db.get('room'+userroom).value();

            console.log('log from memory');
            //console.log('log from memory ',hisLog);
            //console.log('value: ',db.get('posts').value());

            io.sockets.connected[socket.id].emit('load history'+userroom, hisLog);
        }

    });

    //聆聽收到有人進來且跑完歷史訊息
    socket.on('welcome', function(name){
        console.log(name, 'in');
        io.emit('connected'+userroom, name+" is in, let's say hello!!");
    });

    //DB上線連線測試
    //console.log(username + ' connected into db with id: ' + pool.threadId);

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

    //聆聽收到訊息
    socket.on('chat message', function(name, msg){
        console.log(name +' send messenge: '+msg);

        ChatLog(name, msg, userroom);
        //console.log( ChatLog(name, msg, userroom).sql + " function callback");

      io.emit('chat message'+userroom, name, msg);
    });

    //聆聽誰正在輸入，目前只有show在web console
    socket.on('typing', function(name){
        //console.log(name +' chatting messenge: '+msg);
        io.emit('whoistyping'+userroom, name);
    });

    //聆聽傳遞私訊
    socket.on('secret message', function(sender, target, msg){
        //console.log(sender +' send secret messenge to -> '+target);
        var targetId = getListKey(target);
        //console.log("get target key: "+getListKey(target));

        if(targetId != -1)
            io.sockets.connected[targetId].emit('chat message'+userroom, sender, msg);
        else
        {
            msg = "can't find member \""+target+"\" online, please try again";
            console.log(msg);
            io.sockets.connected[socket.id].emit('chat message'+userroom, '<system>', msg);
        }
    });

    //聆聽斷開鎖練
    socket.on('disconnect', function(){
        console.log(socket.id + ' disconnected');
        //DisconnectLog(userinfo[socket.id], userroom);
        io.emit('disconnected'+userroom, userinfo[socket.id]+" has leave us...");
        delete userinfo[socket.id];
        console.log(userinfo);
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
