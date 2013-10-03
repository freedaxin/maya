/**
 * @fileoverview mysql server network actions
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2011.12.29
 */

"use strict";

var util = require('util');
var net = require('net');
var domain =require('domain');
var mysql = require('mysql');
var _ = require('underscore');
var HeadBodyBuffers = require('head_body_buffers').HeadBodyBuffers;
var maya_tools = require('./maya_tools');
var com_nums = require('./constants').com_nums;

function ServerNetwork(host, port, user, passwd, db_name, init_commands,
    conn_wait_timeout, client_flags, reportRes) {
    process.EventEmitter.call(this);
    var self = this;
    this.host = host;
    this.port = port;
    this.user = user;
    this.passwd = passwd;
    this.db_name = db_name;
    this.client_flags = client_flags;
    this.reportRes = reportRes;
    this.connection = null;
    this.client_network = null;
    this.name = [host, port].join(':');
    // for receiving transaction start response
    this.hb_trans_start_res = new HeadBodyBuffers(4, maya_tools.MySQLPacketLength);
    this.hb_trans_start_res.on('packet', function(packet){
        // remove data listener after response recved
        self._unpipeData();
        self.processTransResponse(packet);
    });

    var params = {};
    params.host = this.host;
    params.port = this.port;
    params.user = this.user;
    params.password = this.passwd;
    params.database = this.db_name;
    params.insecureAuth = true;
    params.multipleStatements = true;
    params.flags = this.client_flags;
    this.db_client = mysql.createConnection(params);
    //conn_wait_timeout-100 to avoid closed by server
    this.idle_timeout = conn_wait_timeout*1000-100;
    // temp save client request data
    this.req_data = null;

    // temp reserve res packets for multi slice exec
    this.res_packets = [];
    // record how many eof packets received, 2 means server res finished
    this.res_eofs = 0;
    // parse res data to seperated packets
    this.res_packets_parser = new HeadBodyBuffers(4, maya_tools.MySQLPacketLength);
    this.res_packets_parser.on('packet', function(packet){
        self._processMultiRes(packet);
    });

    this.prepare_res_parser = new HeadBodyBuffers(4, maya_tools.MySQLPacketLength);
    this.prepare_res_parser.on('packet', function(packet) {
        //logger.trace('prepare_res_parser res recved,', self.name, 'data:', packet, packet.length);
        // prepare res ok packet is composed of several packets
        // see:
        // http://dev.mysql.com/doc/internals/en/prepared-statements.html#packet-COM_STMT_PREPARE_OK
        // stmt id only in the first packet should be replaced, packet[3] is the pack seq num
        if (packet[3] === 1) {
            self.client_network.processPrepareRes(packet, self);
            self._unpipeData();
            // write subsequent data to client directly
            self._pipeData();
        } else {
            self.client_network.writePacket(packet);
        };
    });

    this.conn_domain = domain.create();
}

util.inherits(ServerNetwork, process.EventEmitter);

/*
init DB with client params
 */
ServerNetwork.prototype._initDB = function(client_network, callback) {
    var self = this;
    var set_sql = '';
    _.each(client_network.session_settings.user, function (v, k) {
        set_sql += ['@', k, '=', v, ','].join('');
    });
    _.each(client_network.session_settings.global, function (v, k) {
        set_sql += ['GLOBAL ', k, '=', v, ','].join('');
    });
    _.each(client_network.session_settings.session, function (v, k) {
        set_sql += [k, '=', v, ','].join('');
    });
    _.each(client_network.session_settings.nonstandard, function (v, k) {
        set_sql += [k, ' ', v, ','].join('');
    });
    var waiting = 0;
    if (!this.connection) {
        this.db_client.config.clientFlags = client_network.session_settings.client_flags;
        this.db_client.config.maxPacketSize = client_network.session_settings.max_packet_size;
        this.db_client.config.charsetNumber = client_network.session_settings.charset_number;
        this.db_client.config.database = (client_network.db_name || this.db_name);
        if (this.db_client.config.database) {
            this.db_client.config.clientFlags |= 0x8;
        } else {
            this.db_client.config.clientFlags &= ~0x8;
        };
        ++waiting;
        this.db_client.connect(function (err) {
            (0 === --waiting) && callback(err);
        });
    } else if(client_network.db_name) {
        ++waiting;
        this.db_client.query('use ' + client_network.db_name, function (err) {
            (0 === --waiting) && callback(err);
        });
    };

    if (set_sql) {
        set_sql = 'SET ' + set_sql.slice(0, -1);
        //logger.trace('set sql:', client_network.session_settings, set_sql);
        ++waiting;
        this.db_client.query(set_sql, function (err) {
            (0 === --waiting) && callback(err);
        });
    };

    (0 === waiting) && callback();
}

ServerNetwork.prototype._sendTransactionStartPacket = function() {
    var packet = maya_tools.createQueryPacket("BEGIN", 0, com_nums.COM_QUERY);
    this.writePacket(packet);
}

ServerNetwork.prototype._sendRequest = function() {
    var self = this;
    if (this.client_network.is_in_transaction &&
        !this.client_network.is_transaction_started) {
        // transaction begin
        this._unpipeData();
        this._sendTransactionStartPacket();

        this.connection.on('data', function (data) {
            self.hb_trans_start_res.addBuffer(data);
        });
        return;
    };
    if (this.client_network.com_num === com_nums.COM_STMT_PREPARE) {
        this._unpipeData();
        this.connection.on('data', function (data) {
            self.prepare_res_parser.addBuffer(data);
        });
    };
    this.writePacket(this.req_data);
    this.req_data = null;
}

ServerNetwork.prototype.processTransResponse = function(packet) {
    // err packet
    if (packet[4] === 0xff) {
        this.client_network.writePacket(packet);
        this._pipeData();
        return;
    }
    if (this.client_network.is_in_transaction && !this.client_network.is_transaction_started) {
        this.client_network.is_transaction_started = true;
        this._pipeData();
        this.writePacket(this.req_data);
    }
}

ServerNetwork.prototype.execClientReq = function(client_network, needs_reinit) {
    logger.trace("query on db %s for client: %s, data: \n",
        this.name, client_network.name, client_network.req_data);
    this.client_network = client_network;
    // set client req_time
    client_network.req_time = Date.now();
    this.req_data = client_network.req_data;
    client_network.server_network = this;
    if (needs_reinit) {
        var self = this;
        this._initDB(client_network, function (err) {
            if (err) {
                logger.warn('init db failed,', self.host, self.port, err);
                self.cleanup();
                return;
            };
            if (!self.connection) {
                self._initServerConnection();
            } else {
                // remove listeners of db_client first
                self._unpipeData();
                self._pipeData();
            };
            self._sendRequest();
        });
    } else {
        this._sendRequest();
    };
}
/*
there maybe bug in node-mysql changeUser(), so we can't reset session now
ServerNetwork.prototype.release = function(session_settings) {
    //logger.trace('release server, ', this.host, this.name, (new Error()).stack);
    var self = this;
    this.client_network = null;
    // restore ori data listener on db_client
    this._unpipeData();
    _.each(this.db_client.ori_listeners, function (listener) {
        self.db_client._socket.addListener('data', listener);
    });
    // changeUser() will reset session as a new session
    this.db_client.changeUser(function (err) {
        if (err) {
            logger.warn('changeUser err:', err);
            self.cleanup();
            return;
        };
        // emit event to be recyled
        self.emit('release');
    });
}
*/

ServerNetwork.prototype.release = function(session_settings) {
    //logger.trace('release server, ', this.name, (new Error()).stack);
    var self = this;
    this.client_network = null;
    // restore ori data listener on db_client
    this._unpipeData();
    _.each(this.db_client.ori_listeners, function (listener) {
        self.db_client._socket.addListener('data', listener);
    });
    // reset sessions settings to DEFAULT
    var set_sql = '';
    _.each(session_settings.session, function (v, k) {
        set_sql += k + '=DEFAULT,';
    });
    _.each(session_settings.nonstandard, function (v, k) {
        set_sql += k + ' DEFAULT,';
    });
    if (set_sql) {
        set_sql = 'SET ' + set_sql.slice(0, -1);
        //logger.trace('session restore sql:', set_sql);
        this.db_client.query(set_sql, function (err) {
            if (err) {
                logger.warn('set session vars err:', set_sql, err);
                self.cleanup();
                return;
            };
            // emit event to be recyled
            self.emit('release');
        });
    } else {
        self.emit('release');
    };
}

ServerNetwork.prototype._initServerConnection = function() {
    var self = this;
    // take over db connection
    this.connection = this.db_client._socket;
    this.name = [this.name, this.connection.address().port].join(':');;
    this.conn_domain.add(this.connection);
    this.conn_domain.add(this.db_client);
    this.conn_domain.add(this);
    this.conn_domain.on('error', function (e) {
        logger.warn("mysql server conn_domain error:\n%s", e.stack || e);
        self.cleanup();
    });
    this.db_client.ori_listeners = this.db_client._socket.listeners('data');
    this.connection.removeAllListeners('data');
    this.connection.removeAllListeners('end');
    this.connection.on('close', function() {
        self.cleanup();
    });

    this._pipeData();

    this.connection.setTimeout(this.idle_timeout, function(){
        logger.debug("server connection idle timeout: %s:%d", self.name);
        this.destroy();
    });
    logger.trace('server connected', self.name);
}

ServerNetwork.prototype._pipeData = function() {
    var self = this;
    this.connection.on('data', function(data){
        //logger.trace('server res recved,', self.name, 'data:', data, data.length);
        if (!self.client_network || !self.client_network.connection) {
            self.cleanup()
            return;
        };
        if (self.client_network.req_time) {
            self.client_network.res_time = Date.now() - self.client_network.req_time;
            self.reportRes(self.client_network);
        };
        if (0 === self.client_network.multi_execute_slices) {
            self.client_network.writePacket(data);
        } else {
            self.res_packets_parser.addBuffer(data);
        };
    });
}

ServerNetwork.prototype._unpipeData = function() {
    this.connection.removeAllListeners('data');
};

ServerNetwork.prototype._processMultiRes = function(packet) {
    //logger.trace("server multi res data:\n", packet, packet.length, this.name);
    this.res_packets.push(packet);
    if (maya_tools.isEOFPacket(packet)) {
        this.res_eofs++;
    };

    if (2 == this.res_eofs ||
        maya_tools.isOKPacket(packet) ||
        maya_tools.isErrorPacket(packet) ||
        this.client_network.com_num === com_nums.COM_SET_OPTION) {
        this.client_network.processMultiRes(this.res_packets);
        this.res_packets = [];
        this.res_eofs = 0;
    };
}

ServerNetwork.prototype.cleanup = function() {
    //logger.trace('server cleanup\n', (new Error()).stack);
    try {
        this.res_packets = [];
        this.res_eofs = 0;
        if(this.client_network && this.client_network.connection) {
            this.client_network.clearSession(this);
            if (this.client_network.server_network === this) {
                if (this.client_network.req_time) {
                    this.emit('conn_fail_in_query', this.client_network);
                } else {
                    this.client_network.connection.destroy();
                };
            };
            this.client_network = null;
        };
        if (this.connection) {
            //this.db_client.end();
            //this.connection.removeAllListeners('data');
            this.connection.destroy();
            this.connection = null;
        };
        this.emit('dead');
    } catch(e) {
        logger.warn("cleanup exception: %s", e);
    };
}

ServerNetwork.prototype.writePacket = function(packet) {
    this.connection.write(packet, 'binary');
}

exports.ServerNetwork = ServerNetwork;
