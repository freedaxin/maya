/**
 * @fileoverview maya tools
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2012.2.27
 */

"use strict";

var writer = require('./writer').writer;
var reader = require('./reader').reader;
var crypto = require('crypto');
var os=require('os');

/**
* @description get packet length of mysql packet
* @param {Buffer} data
*/
exports.MySQLPacketLength = function (data) {
    var len = data[0];
    len += (data[1] << 8);
    len += (data[2] << 16);
    return len;
}

/********************
 *
 * 8000000
 * 0a                           protocol version
 * 352e312e34322d6c6f6700       server version(5.1.42-log)
 * 12 d3 66 01                  connection thread id(auto increasement)
 * 4e 60 77 57 2e 7c 4c 42      auth plugin data part 1, scramble buff(random, WARN: it should be < 128)
 * 00                           filler(certain)
 * ff f7                        server capabilities(lower 2 bytes)
 * 21                           server language
 * 02 00                        server status flag
 * 00 00                        capabilities flag(upper 2 bytes)
 * 00                           if ... else 00
 * 00 00 00 00 00 00 00 00 00 00   filler
 * 49 26 7e 6e 2d 33 58 44 29 3e 3c 53 00   if ...  auth-plugin-data-part-2 ( WARN: see WARN above.)
 *
 ********************/

var greeting_packet = new Buffer(60);
exports.createGreetingPacket = function() {
    var res = new writer();
    res.add("\n");
    res.zstring("5.1.42-log");
    // fake thread id
    res.add("\x00\x00\x00\x00");
    // use base64 to convert every 3 bytes to 4 bytes, here add 8 bytes.(fill zero if less than 3 bytes.)
    res.add(crypto.randomBytes(6).toString('base64'));
    res.add("\x00");
    // server capabilities
    res.add("\xff\xf7");
    // server language
    res.add("\x21");
    // server status
    res.add("\x02\x00");
    for(var i=0;i<13;i++) {
        res.add('\x00');
    }
    res.zstring(crypto.randomBytes(9).toString('base64'));
    res.addHeader();

    greeting_packet.write(res.data, 0, 'binary');
    return res.data;
}

exports.getGreetingPacket = function() {
    return greeting_packet;
};

exports.createOKPacket = function (packet_num, affected_rows, warning_count) {
    var res = new writer();
    //field_count
    res.lcnum(0);
    //affected_rows
    res.lcnum(affected_rows || 0);
    //insert_id
    res.lcnum(0);
    //server_status
    res.int2(0);
    //warning_count
    res.int2(warning_count || 0);
    //message
    res.add("");
    //header
    res.addHeader(packet_num ? packet_num : 0);
    return res.data;
}

exports.createEOFPacket = function (packet_num, warning_count) {
    var res = new writer();
    //field_count
    res.int1(0xfe);
    //warning_count
    res.int2(warning_count || 0);
    //server_status
    /*
    #include/mysql_com.h
    #define SERVER_STATUS_IN_TRANS     1
    #define SERVER_STATUS_AUTOCOMMIT   2
    #define SERVER_MORE_RESULTS_EXISTS 8
    #define SERVER_QUERY_NO_GOOD_INDEX_USED 16
    #define SERVER_QUERY_NO_INDEX_USED      32
    */
    res.int2(2);
    //header
    res.addHeader(packet_num ? packet_num : 0);
    return res.data;
}

exports.createErrorPacket = function (packet_num, err, extra_err_desc) {
    var res = new writer();
    //field_count
    res.lcnum(0xff);
    //errno
    res.int2(err.err_no);
    //This is always '#'
    res.add("#");
    //sqlstate
    res.add(err.sql_state);
    //message
    res.add(err.message);
    extra_err_desc && res.add(extra_err_desc);
    //header
    res.addHeader(packet_num ? packet_num : 0);
    return res.data;
}

exports.createQueryPacket = function(sql, packet_num, com_num) {
    var body_length = sql.length + 1;
    var packet = new Buffer(body_length + 4);
    packet.writeUInt8(body_length & 0xff, 0);
    packet.writeUInt8(body_length >> 8 & 0xff, 1);
    packet.writeUInt8(body_length >> 16 & 0xff, 2);
    packet.writeUInt8(packet_num, 3);
    packet.writeUInt8(com_num, 4);
    packet.write(sql, 5, null, 'binary');
    return packet;
}

exports.generateToken = function(packet, password) {
    var r = new reader(packet);
    //header+protocolVersion: 4+1
    r.skip(5);
    r.zstring();
    //threadId: 4
    r.skip(4);
    // scramble_buff
    var salt = new Buffer(20);
    r.bytes(8).copy(salt);
    //filler + server_capabilities + server_language + server_status + server capabilities
    //+ length of the scramble + (filler)  always 0
    // 1+2+1+2+2+1+10
    r.skip(19);
    r.bytes(12).copy(salt, 8);
    var token = password !== "" ? scramble(password, salt) : "";
    return token;
}

exports.isOKPacket = function(packet) {
    return packet[4] === 0x00;
}

exports.isErrorPacket = function(packet) {
    return packet[4] === 0xff;
}

exports.isEOFPacket = function(packet) {
    return packet[4] === 0xfe && packet.length <= 9;
}

function xor(s1, s2) {
    var res = "";
    for(var i = 0; i < 20; ++i) {
        res += String.fromCharCode(s1.charCodeAt(i) ^ s2.charCodeAt(i));
    }
    return res;
}

//
// mysql 4.2+ authorisation protocol
// token = sha1(salt + sha1(sha1(password))) xor sha1(password)
//
function scramble(password, salt) {
    var stage1 = sha1(password);
    var stage2 = sha1(stage1);
    var stage3 = sha1(salt + stage2);
    return xor(stage3, stage1);
}

function sha1(msg) {
    var hash = crypto.createHash('sha1');
    hash.update(msg);
    return hash.digest('binary');
}

/* get ip, the order we want is: eth1, eth0, br0, etc. */
exports.getIP = function() {
    var eth;
    for(var x in os.networkInterfaces()) {
        eth = os.networkInterfaces()[x];
    }
    return eth[0].address;
}

/* get microseconds from hrtime([seconds, nanoseconds]) */
exports.hrtime2microseconds = function(hrtime) {
    return Math.floor(hrtime[0] * 1000000 + hrtime[1] / 1000);
}
