/**
 * @fileoverview mysql client network actions
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2011.12.29
 */

'use strict';

var util = require('util');
var domain =require('domain');
var _ = require('underscore');
var HeadBodyBuffers = require('head_body_buffers').HeadBodyBuffers;
var router = require('./router');
var maya_tools = require('./maya_tools');
var MAYA_ERROR = require('./constants').MAYA_ERROR;
var reader = require('./reader').reader;
var writer = require('./writer').writer;
var com_nums = require('./constants').com_nums;

function ClientNetwork(connection) {
    this.name = connection.remoteAddress + ':' + connection.remotePort;
    this.connection = connection;
    this.server_network = null;

    this.maya_user = '';
    this.db_name = '';
    this.is_in_transaction = false;
    this.is_transaction_started = false;
    this.last_write_time = 0;
    this.last_used_group = null;
    this.head_body_buffers = new HeadBodyBuffers(4, maya_tools.MySQLPacketLength);
    this.router = null;
    this.packet_num = 0;
    this.com_num = 0;
    this.req_data = null;
    // client request start time, ms timestamp
    this.req_time = 0;
    // client request reponse time, microseconds
    this.res_time = 0;
    this.operation = null;
    this.origin_sql = null;
    this.use_slave = false;

    // multi slice execute params
    this.multi_execute_slices = 0;
    this.multi_res_packets = [];
    this.multi_res_total_len = 0;

    // http://dev.mysql.com/doc/refman/5.0/en/set-statement.html
    // http://dev.mysql.com/doc/internals/en/stored-procedures.html#com-set-option
    this.session_settings = {
        'user' : {},
        'global' : {},
        'session' : {},
        'nonstandard' : {}, // CHARACTER SET, NAMES
        'client_flags' : 0,
        'max_packet_size' : 0,
        'charset_number' : 0,
    };
    this.sessions = {};

    // generate new stmt id for client prepare stmt
    this.stmt_id_seq = 0;
    this.stmt_servers = {};

    this.conn_domain = domain.create();
    this.conn_domain.add(this);
};

ClientNetwork.prototype.startup = function() {
    var self = this;
    this.conn_domain.add(this.connection);
    this.conn_domain.on('error', function (e) {
        try {
            logger.info('client conn_domain error:\n%s\n%s',
                e.stack, self.origin_sql);
            self.connection && self.connection.destroy();
        } catch (e) {
        }
    });
    this.connection.on('data', function (data) {
        self.head_body_buffers.addBuffer(data);
    });
    this.head_body_buffers.once('packet', function(packet) {
        self.readClientAuth(packet);
    });
    // close related server conn when closed without COM_CLOSE
    this.connection.on('close', function() {
        logger.trace('client conn closed: %s', self.name);
        self.connection = null;
        self.server_network && self.server_network.cleanup();
        self.server_network = null;
    });
    //send greeting packet to client
    var packet = maya_tools.getGreetingPacket();
    this.writePacket(packet);
}

ClientNetwork.prototype.writePacket = function(packet) {
    logger.trace('write to client:\n', packet);
    // end connection after query complete if process is terminating
    if (global.terminated && this.com_num === com_nums.COM_QUERY && !this.is_in_transaction) {
        this.connection.end(packet, 'binary');
    } else {
        this.connection.write(packet, 'binary');
    };
    this.req_time = 0;
};

ClientNetwork.prototype.readClientAuth = function(packet) {
    //logger.trace('received client auth pack', packet, packet.toString('binary'));
    var client_auth = {};
    var r = new reader(packet);
    // header+client_flags+max_packet_size+charset_number+filler
    // 4 + 4 + 4 + 1 + 23
    r.skip(4);
    this.session_settings.client_flags = r.num(4);
    this.session_settings.max_packet_size = r.num(4);
    this.session_settings.charset_number = r.num(1);
    r.skip(23);
    client_auth.user = r.zstring();
    client_auth.scramble_buff = r.lcstring();
    client_auth.databasename = r.zstring();
    this.maya_user = client_auth.user;
    this.db_name = client_auth.databasename;
    this.router = router.getRouter(this, client_auth.scramble_buff);
    if (!this.router) {
        return;
    };
    this.head_body_buffers.on('packet', this.readClientCommand.bind(this));
}

ClientNetwork.prototype.readClientCommand = function(packet) {
    //logger.trace('client req from', this.name, packet.toString('binary'));
    try {
        this.req_data = packet;
        this.packet_num = packet[3];
        this.com_num = packet[4];
        this.router.execClientReq(this);
    } catch(e) {
        logger.warn('execClientReq exception for %s: %j\n%s\nsql: %s\ndata:',
            this.name, e, e.stack, this.origin_sql, this.req_data);
        var res_packet = maya_tools.createErrorPacket(this.packet_num+1,
            (e instanceof Error) ? MAYA_ERROR.INTERNAL_ERROR : e);
        this.writePacket(res_packet);
        // close connection if exception in multi slice execute
        if (this.multi_execute_slices > 1) {
            this.connection.end();
        };
    };
}

ClientNetwork.prototype.releaseServer = function() {
    //logger.trace('release server sessions of client:', this.name);
    var self = this;
    _.each(this.sessions, function (db_group) {
        _.each(db_group, function (server_network) {
            server_network && server_network.release(self.session_settings);
        });
    });
    this.server_network = null;
}

ClientNetwork.prototype.clearSession = function(session) {
    var self = this;
    _.each(this.sessions, function (db_group) {
        _.each(db_group, function (server_network, mstype, list) {
            if (session === server_network) {
                list[mstype] = null;
            };
        });
    });
    _.each(this.stmt_servers, function (stmt, client_id, list) {
        if (session === stmt.server_network) {
            delete list[client_id];
        };
    });
}

ClientNetwork.prototype.cleanupUnusedSessions = function() {
    var self = this;
    _.each(this.sessions, function (db_group) {
        _.each(db_group, function (server_network, mstype) {
            if (self.server_network !== server_network) {
                server_network.cleanup();
            } else if (!self.is_transaction_started && !self.req_time) {
                self.server_network = null;
                server_network.cleanup();
            };
        });
    });
    this.sessions = {};
}

/*
OK Packet
Error Packet
EOF Packet
mysql res packets
    (Result Set Header Packet) the number of columns
    (Field Packets) column descriptors
    (EOF Packet) marker: end of Field Packets
    (Row Data Packets) row contents
    (End Packet) marker: end of Data Packets
*/
ClientNetwork.prototype.processMultiRes = function(res_packets) {
    try {
        for (var i = res_packets.length-1; i >= 0; i--) {
            this.multi_res_total_len += res_packets[i].length;
        };
        this.multi_res_packets.push(res_packets);
        if (this.multi_res_packets.length < this.multi_execute_slices) {
            // not enough responses
            return;
        }
        var buf = new Buffer(this.multi_res_total_len);
        var pos = 0;
        var multi_execute_packnum = 1;
        var row_data_packets_begin = 0;
        var affected_rows = 0;
        var res_error_num = 0;
        var eof_packet = null;
        for (var i = this.multi_res_packets.length - 1; i >= 0; i--) {
            var packets = this.multi_res_packets[i];
            if (maya_tools.isErrorPacket(packets[0])) {
                ++res_error_num;
                continue;
            };
            if (maya_tools.isOKPacket(packets[0])) {
                var r = new reader(packets[0]);
                r.skip(5);
                affected_rows += r.lcnum();
                continue;
            };
            // COM_SET_OPTION will get EOF packet
            if (maya_tools.isEOFPacket(packets[0])) {
                break;
            };
            // result set packets
            if (multi_execute_packnum === 1) {
                // fill Result Set Header Packet, Field Packets, EOF Packet,
                // ??? the tablename in field packets is slice table name,
                // is it necessary to replace with virtual
                for (var j = 0; j < packets.length; j++) {
                    var packet = packets[j];
                    pos += packet.copy(buf, pos);
                    ++row_data_packets_begin;
                    //logger.trace('header packet: ', packet);
                    // break if field packets eof is copyed, and record the packnum
                    if (maya_tools.isEOFPacket(packet)) {
                        eof_packet = packet;
                        multi_execute_packnum = packet[3] + 1;
                        break;
                    };
                };
            };
            // i < packets.length - 1 to skip eof of row data packets
            // ??? what if multi_execute_packnum > 255?
            for (var k = row_data_packets_begin; k < packets.length - 1; k++) {
                packets[k][3] = multi_execute_packnum++;
                pos += packets[k].copy(buf, pos);
                //logger.trace('data packet: ', packets[k]);
            };
        };
        if (0 === pos) {
            // didn't copy any data to buf, means all packets are ok/error/EOF
            var packet = null;
            if (res_error_num >= this.multi_res_packets.length ||
                this.com_num === com_nums.COM_SET_OPTION) {
                // all error/eof packets, send first response to client
                packet = this.multi_res_packets[0][0];
            } else if (0 === res_error_num) {
                // all ok packets, return sum affected_rows
                packet = maya_tools.createOKPacket(this.packet_num+1, affected_rows, 0);
            } else {
                // partial slice failed, send error packet to client
                packet = maya_tools.createErrorPacket(
                    this.packet_num+1, MAYA_ERROR.PARTIAL_SLICE_FAIL);
            };
            this.writePacket(packet);
        } else {
            // it's a select query
            // there must be a eof_packet
            if (1 === this.router.multi_query_mode && res_error_num > 0) {
                // partial fail is not allowed when select in strict mode
                var packet = maya_tools.createErrorPacket(
                    this.packet_num+1, MAYA_ERROR.PARTIAL_SLICE_FAIL);
                this.writePacket(packet);
            } else {
                eof_packet[3] = multi_execute_packnum++;
                pos += eof_packet.copy(buf, pos);
                this.writePacket(buf.slice(0, pos));
            }
            //logger.trace('multi res packet to client:\n', buf.slice(0, pos));
            //logger.trace('multi res packet to client:\n', buf.slice(0, pos).toString('binary'));
        };
        this.resetMultiExec();
    } catch (e) {
        logger.warn('processMultiRes exception for %s: %j\n%s', this.name, e, e.stack);
        var res_packet = maya_tools.createErrorPacket(this.packet_num+1, MAYA_ERROR.INTERNAL_ERROR);
        this.writePacket(res_packet);
        this.resetMultiExec();
    };
}

ClientNetwork.prototype.resetMultiExec = function() {
    this.multi_execute_slices = 0;
    this.multi_res_packets = [];
    this.multi_res_total_len = 0;
}

ClientNetwork.prototype.processServerError = function(server) {
    logger.trace('server query conn failed: %s, %s', this.name, this.origin_sql);
    if (this.connection && this.req_time) {
        var packet = maya_tools.createErrorPacket(
            this.packet_num+1, MAYA_ERROR.SERVER_CONN_FAIL, ' ' + server);
        packet = new Buffer(packet, 'binary');
        if (this.multi_execute_slices) {
            this.processMultiRes([packet]);
        } else {
            this.writePacket(packet);
        };
    };
    this.server_network = null;
}

/*
kill slow query if req_time <= start_time
*/
ClientNetwork.prototype.killLongQuery = function(start_time) {
    if (this.req_time === 0 || this.req_time > start_time || !this.use_slave) {
        return;
    };
    logger.info('slow query killed, req from user: [%s], addr: [%s], sql: %s',
        this.maya_user, this.name, this.origin_sql);
    this.connection && this.connection.destroy();
    this.connection = null;
}

ClientNetwork.prototype.setSessionVars = function(sql_tokens) {
    for (var i = 1; i < sql_tokens.length; i++) {
        if (/^@@/.test(sql_tokens[i])) {
            if (/^@@global/i.test(sql_tokens[i])) {
                // SET @@global.sort_buffer_size=1000000
                this.session_settings.global[sql_tokens[i+2].toLowerCase()] = sql_tokens[i+4];
                i += 5; // skip ','
            } else if (/^@@session|^@@local/i.test(sql_tokens[i])) {
                // SET @@local.sort_buffer_size=10000;
                this.session_settings.session[sql_tokens[i+2].toLowerCase()] = sql_tokens[i+4];
                i += 5; // skip ','
            } else {
                // SET @@sort_buffer_size=10000;
                this.session_settings.session[sql_tokens[i].substr(2).toLowerCase()] = sql_tokens[i+2];
                i += 3; // skip ','
            };
        } else if (/^global/i.test(sql_tokens[i])) {
            // SET GLOBAL sort_buffer_size=1000000
            this.session_settings.global[sql_tokens[i+1].toLowerCase()] = sql_tokens[i+3];
            i += 4; // skip ','
        } else if (/^session|^local/i.test(sql_tokens[i])) {
            // SET SESSION sort_buffer_size=1000000
            this.session_settings.session[sql_tokens[i+1].toLowerCase()] = sql_tokens[i+3];
            i += 4; // skip ','
        } else if (/^@/.test(sql_tokens[i])) {
            // SET @usr_var=10000
            this.session_settings.user[sql_tokens[i].substr(1).toLowerCase()] = sql_tokens[i+2];
            i += 3; // skip ','
        } else if (/CHARACTER/i.test(sql_tokens[i]) && /SET/i.test(sql_tokens[i+1])) {
            this.session_settings.nonstandard['CHARACTER SET'] = sql_tokens[i+2];
            i += 3;
        } else if (/NAMES/i.test(sql_tokens[i])) {
            var v = '';
            for (var p = i+1; p < sql_tokens.length && sql_tokens[p] != ','; p++) {
                v += ' ' + sql_tokens[p];
            };
            this.session_settings.nonstandard['NAMES'] = v;
            i = p;
        } else {
            // SET sort_buffer_size=10000;
            this.session_settings.session[sql_tokens[i].toLowerCase()] = sql_tokens[i+2];
            i += 3; // skip ','
        }
    };
}

ClientNetwork.prototype.execSessionReq = function() {
    var server_networks = [];
    _.each(this.sessions, function (db_group) {
        server_networks = server_networks.concat(_.values(db_group).filter(
            function (x) {
                return x != null;
            }));
    });
    if (0 === server_networks.length) {
        this.router.default_db_group.execClientReq(true, this);
        return;
    };
    this.multi_execute_slices = server_networks.length;
    for (var i = server_networks.length - 1; i >= 0; i--) {
        server_networks[i].execClientReq(this);
    };
}

ClientNetwork.prototype.processPrepareRes = function (packet, server_network) {
    if (!maya_tools.isErrorPacket(packet)) {
        var stmt_id_server = packet.readUInt32LE(5);
        var stmt_id_client = ++this.stmt_id_seq;
        this.stmt_servers[stmt_id_client] = {
            'stmt_id_server': stmt_id_server,
            'server_network': server_network,
            'prepare_sql': this.origin_sql,
            'operation': this.operation,
        };
        packet.writeUInt32LE(stmt_id_client, 5);
        //logger.trace('new prepare res:', packet, this.name, this.stmt_id_seq, stmt_id_server);
    }
    this.writePacket(packet);
}

ClientNetwork.prototype.execStmt = function (is_close) {
    var stmt_id = this.req_data.readUInt32LE(5);
    var stmt = this.stmt_servers[stmt_id];
    if (!stmt) {
        throw MAYA_ERROR.NO_STMT_ID;
        return;
    };
    this.origin_sql = stmt.prepare_sql;
    this.operation = stmt.operation;
    this.req_data.writeUInt32LE(stmt.stmt_id_server, 5);;
    stmt.server_network.execClientReq(this);
    if (is_close) {
        delete this.stmt_servers[stmt_id];
    };
}

exports.ClientNetwork = ClientNetwork;
