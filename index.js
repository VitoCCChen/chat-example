var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 9501;
const low = require('lowdb');
const Memory = require('lowdb/adapters/Memory');
const db = low(new Memory);
db.defaults({ rooms: {} }).write();

var mysql = require('mysql');

var pool  = mysql.createPool({
    host: "localhost",
    user: "pkbar",
    password: "ZwxhAV8e",
    database: "manage"
});

pool.getConnection(function(err, connection) {
    // connected! (unless `err` is set)
});

//將聊天紀錄存入DB
function ChatLog(name, msg, mem_id, room){
    //connection doent have to reconnet DB everytime
    //connection.connect();
    var table = 'program_chatroom';
    var sRoom = room.split("-");
    var data = {cl_pgram_id: sRoom[0], cl_record_id: sRoom[1], cl_sender: name, cl_msg: msg, cl_mem_id: mem_id, cl_lastmanage: 'user'};
    var q = pool.query('INSERT INTO ?? SET ?,cl_creatdate=CURRENT_TIME()', [table, data], function (error, results, fields) {
        //[try] to release
        //connection.release();

        if (error) throw error;
    });

    return q;
}

function getlastindex(callback){
    pool.query('SELECT COUNT(cl_id) AS countrow FROM program_chatroom', function (error, results, fields) {
        if (error) throw error;

        //console.log('row count '+ results[0].countrow);

        if(callback instanceof Function)  callback(results[0].countrow);
    });
}

//抓舊聊天紀錄
function getHistoryChat(room, callback){
    var lim = 10 ;
    //console.log('room in function', room);


    var sRoom = room.split("-");

    //現在用不到兩層callback, 但先留著參考
    getlastindex( function(index){
        index -= lim;
        //pool.query('SELECT ?? FROM ?? LIMIT ? OFFSET ? ORDER BY ?? DESC',[['name', 'log'],'chat', lim, index, 'id'], function (error, results, fields) {
        //pool.query('SELECT ?? FROM ?? WHERE ??=? ORDER BY ?? DESC LIMIT ?',[['name', 'log'],'chat', 'room', room, 'id', lim], function (error, results, fields) {
        //pool.query('SELECT ?? FROM ?? WHERE ??=?',[['name', 'log'],'chat2', 'room', room], function (error, results, fields) {
        //pool.query('SELECT ?? FROM ?? WHERE ??=? AND ??=?',['cl_record','program_chatroom', 'cl_pgram_id', sRoom[0], 'cl_record_id', sRoom[1]], function (error, results, fields) {
        pool.query('SELECT ??, ??, ??, ?? FROM ?? LEFT JOIN ?? ON ??=?? WHERE ??=? AND ??=? ORDER BY ??',['cl_sender', 'cl_msg', 'url_photo', 'cl_creatdate','program_chatroom', 'member', 'member_id', 'cl_mem_id', 'cl_pgram_id', sRoom[0], 'cl_record_id', sRoom[1], 'cl_creatdate'], function (error, results, fields) {
            if (error) throw error;

            if(callback instanceof Function)  callback(results);
        })
    });
}

//以value抓取array的key值
function getListKey(arr, targetValue){
    //console.log('userlist',arr);

    for (var key in arr) {
        var value = arr[key];

        if(value === targetValue)
            return key;
    }
    return -1;
}

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

//聆聽連結
io.on('connection', function(socket){
    var userId = socket.id;
    var username = socket.handshake.query.name;
    var userroom = socket.handshake.query.room;

    socket.join(userroom);

    socket.on('login', function(changedName){
	username = changedName;

	db.get('rooms.room'+userroom+'.member').set(userId, username).write();

	console.log('update member ', db.get('rooms.room'+userroom+'.member').value());
	console.log(username+" is in");


    });

    //分配房間，並show該房間歷史紀錄
    socket.on('create', function(room) {

        userroom = room;

        var roomisNew = false;
        if(!db.get('rooms').has('room'+userroom).value())
        {
            roomisNew = true;

            console.log("created room: ",room);
        }

        //紀錄上線進DB
        //ConnectLog(username, userroom);

        //[try]送給新user歷史紀錄
        var hisLog = [];

        if(roomisNew){
            getHistoryChat(userroom, function(results){
                //設定房間名稱
                db.get('rooms').set('room'+userroom, {} ).write();

                //設定並加入使用者
                db.get('rooms.room'+userroom).set("member", {} ).write();
                db.get('rooms.room'+userroom+'.member').set(userId, username).write();

                //從DB加入該房間的歷史紀錄
                hisLog = db.get('rooms.room'+userroom).set("msg", results ).write();

                //請使用者loading 這些歷史訊息
                io.sockets.connected[userId].emit('load history'+userroom, hisLog);

                //console.log(results);
                //console.log("whole table",db.get('rooms').value());
                //console.log("history",hisLog);
                console.log('log from mysql');
            });
        }
        else{
            //從暫存DB加入該房間的歷史訊息
            hisLog = db.get('rooms.room'+userroom).value();


            //將使用者加入該房間上線名單
            var tempObject = {};
            tempObject[userId] = username;
            db.get('rooms.room'+userroom+'.member').set(userId, username).write();
            //db.get('rooms.room'+userroom+'.member').push(tempObject).write();
            //var insert = db.get('rooms.room'+room+'.msg').push({ cl_record: record}).write();
            //請使用者loading 房間的歷史訊息
            io.sockets.connected[userId].emit('load history'+userroom, hisLog);

            console.log('log from memory');
            //console.log("whole table",db.get('rooms').value());
            //console.log('log from memory ',hisLog);
        }
    });

    //聆聽收到有人進來且跑完歷史訊息
    socket.on('welcome', function(name){
        console.log(name+" is in");

        var roomInfo = 'Room '+userroom+', currently Online: '+db.get('rooms.room'+userroom+'.member').size().value()+ '|';
        for(var key in db.get('rooms.room'+userroom+'.member').value()){
            roomInfo += ' '+ db.get('rooms.room'+userroom+'.member.'+key).value() + ',';
        }
        io.emit('update roomInfo'+userroom, roomInfo);

        console.log('user: ', name, 'in');
        console.log('update member ', db.get('rooms.room'+userroom+'.member').value());
        //console.log(db.get('rooms.room'+userroom+'.member').value());
        //console.log(db.get('rooms.room'+userroom+'.msg').size().value());
        //console.log(db.get('rooms').size().value());
    });

    //聆聽收到訊息
    socket.on('chat message', function(name, mem_id, msg, pic){
        console.log(name +' send messenge: '+msg);

        ChatLog(name, msg, mem_id, userroom);
        var insert = db.get('rooms.room'+userroom+'.msg').push({ cl_sender: name, cl_msg: msg, url_photo: pic, cl_creatdate:new Date()}).write();
        console.log(insert);

        io.emit('chat message'+userroom, name, msg, pic);
    });

    //聆聽斷開鎖練
    socket.on('disconnect', function(){
        var Passenger = 'rooms.room'+userroom+'.member.'+userId;

        console.log(userId+ ': ' + db.get(Passenger).value()+ ' disconnected');
        //io.emit('disconnected'+userroom, db.get(Passenger).value()+" has leave us...");
        db.unset('rooms.room'+userroom+'.member.'+userId).write();
        if(db.get('rooms.room'+userroom+'.member').size().value() == 0)
            db.unset('rooms.room'+userroom).write();
        console.log('update member ', db.get('rooms.room'+userroom+'.member').value());
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
