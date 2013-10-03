/**
 * @fileoverview read binary mysql packet
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2011.12.29
 */
 
"use strict";

var sys = require('util'), constants = require('./constants');

function reader(data) {
    this.data = data;
    this.pos = 0;
}

// read n-bytes number
// TODO: add unsigned flag and code to read signed/unsigned integers
reader.prototype.num = function(numbytes) {
    var res = 0;
    var factor = 1;
    for(var i = 0; i < numbytes; ++i) {
        res += this.data[this.pos] * factor;
        factor = factor * 256;
        this.pos++;
    }
    return res;
}

reader.prototype.zstring = function() {
    var start = this.pos;
    while(this.data[this.pos++]) {
    }
    return this.data.toString(null, start, this.pos-1);
}

reader.prototype.lcstring = function() {
    var len = this.lcnum();
    var res = this.bytes(len).toString('binary');
    return res;
}

reader.prototype.lcbits = function() {
    var len = this.lcnum();
    var val = this.num(len);
    var bitstring = [];
    while(val > 0) {
        bitstring.push((val % 2) ? true : false);
        val = Math.floor(val / 2);
    }
    if(bitstring.length == 1) {
        return bitstring[0];
    }
    return bitstring;
}

reader.prototype.tail = function() {
    var res = this.data.toString(null, this.pos);
    this.pos = this.data.length;
    return res;
}

reader.prototype.isErrorPacket = function() {
    return this.data[4] == 0xff;
}

reader.prototype.readOKpacket = function() {
    var res = {};
    res.field_count = this.data[this.pos++];
    if(res.field_count == 0xff)// error
    {
        res.errno = this.data[this.pos] + (this.data[this.pos + 1] << 8);
        // at least for 1040 +8 offset is incorrect TODO: check where +8 comes from
        if(res.errno != 1040)
            this.pos += 8;
        else
            this.pos += 2;
        //this.pos++; // skip sqlstate marker, "#"
        //res.sqlstate = this.bytes(5); FIXME!!!

    } else if(res.field_count == 0xfe && this.data.length <= 9) {
        // eof packet
        res.warning_count = this.num(2);
        res.server_status = this.num(2);
    } else {
        res.affected_rows = this.lcnum();
        res.insert_id = this.lcnum();
        res.server_status = this.num(2);
        res.warning_count = this.num(2);
    }
    res.message = this.tail();
    return res;
}

reader.prototype.lcnum = function() {
    var b1 = this.data[this.pos];
    this.pos++;
    if(b1 < 251)
        return b1;
    else if(b1 == 252)
        return this.num(2);
    else if(b1 == 253)
        return this.num(3);
    else if(b1 == 254)
        return this.num(8);
}

reader.prototype.bytes = function(n) {
    var res = new Buffer(n);
    this.data.copy(res, 0, this.pos, this.pos+n);
    this.pos += n;
    return res;
}

reader.prototype.skip = function(n) {
    this.pos += n;
}

exports.reader = reader;
