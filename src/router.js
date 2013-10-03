/**
 * @fileoverview client command router
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2011.12.29
 */

"use strict";

var util = require('util');
var _ = require('underscore');
var SqlParser = require('sqlparser').SqlParser;
var DBGroup = require('./db_group').DBGroup;
var com_nums = require('./constants').com_nums;
var SQL_TOKENS = require('./constants').SQL_TOKENS;
var MAYA_ERROR = require('./constants').MAYA_ERROR;
var VirtualTable = require('./virtual_table').VirtualTable;
var maya_tools = require('./maya_tools');

function Router() {
    this.app_name = "";
    this.user = "";
    this.password = "";
    this.db_groups = {};
    this.default_db_group = null;
    this.sql_parser = new SqlParser();
    this.virtual_table = [];
    // for summary log output, record req counter
    this.req_cnt = 0;
    // summary interval
    this.summary_interval = 10;
    this.inter_sum_log = 0;
    this.token = "";
    this.force_read_master_microseconds = 0;
    this.multi_query_mode = 1;
    this.kill_long_query_time = 0;
    this.long_query_time = 0;
    this.client_max_conn_num = 400;
    // all client_networks in this app
    this.clients = {};
    // limit connections per ip
    this.ip_connections = {};
    // kill long query interval
    this.inter_check_long_query = 0;
    this.map_slice_db_group = {};
}

Router.prototype.init = function(cluster_conf) {
    var self = this;
    this.app_name = cluster_conf.app_name;
    this.user = cluster_conf.maya_user;
    this.password = cluster_conf.maya_passwd;
    this.force_read_master_microseconds = (cluster_conf.force_read_master_seconds
            === undefined ? 0 : cluster_conf.force_read_master_seconds) * 1000;
    this.multi_query_mode =
        cluster_conf.multi_query_mode === undefined ? 1 : cluster_conf.multi_query_mode;
    this.kill_long_query_time = cluster_conf.kill_long_query_time;
    this.long_query_time = cluster_conf.long_query_time;
    this.client_max_conn_num = cluster_conf.client_max_conn_num || 400;

    var zk_path = global.global_conf.zk_conf.maya_zk_path
                    + "/apps/" + this.app_name;
    cluster_conf.db_groups.forEach(function(x){
        self.db_groups[x.name] = new DBGroup(x, cluster_conf, zk_path);
        // use the first db group as the default db group
        if(!self.default_db_group) {
            self.default_db_group = self.db_groups[x.name];
        }
        if(x.is_default) {
            logger.debug("set default db group: %s", x.name);
            self.default_db_group = self.db_groups[x.name];
        };
    });
    if (cluster_conf.virtual_table) {
        cluster_conf.virtual_table.forEach(function(y){
            self.check_virtual_db_group(y, cluster_conf.db_groups);
            var vt = new VirtualTable();
            vt.init(y);
            self.virtual_table.push(vt);
            vt.getAllSlicesMap(self.map_slice_db_group);
        });
    };
    this.inter_sum_log = setInterval(this.summaryLog.bind(this),
                                        this.summary_interval*1000);
    if (this.kill_long_query_time > 0) {
        this.inter_check_long_query = setInterval(this.killLongQuery.bind(this),
            this.kill_long_query_time/2);
    };
}

Router.prototype.check_virtual_db_group = function(vt, db_groups) {
    vt.partitions.forEach(function(partition) {
        var found = false;
        db_groups.forEach(function(x){
            if (x.name == partition.db_group) {
                found = true;
            }
        });
        if (! found) {
            logger.error("Error! No db group(%s) found in virtual table(%s)", partition.db_group, vt.virtual_table_name);
            throw "Error! No db group found in virtual table.";
        }
    });
}

Router.prototype.summaryLog = function(interval) {
    logger.info("pid: %d, new reqs of [%s] in %d seconds: [%d]",
        process.pid, this.app_name, this.summary_interval, this.req_cnt);
    this.req_cnt = 0;
}

Router.prototype.cleanup = function() {
    for(var i in this.db_groups) {
        this.db_groups[i].stop();
    };
    clearInterval(this.inter_sum_log);
    clearInterval(this.inter_check_long_query);
}

Router.prototype.getSummary = function() {
    var summary = {};
    summary.app_name = this.app_name;
    summary.db_groups = [];
    for (var i in this.db_groups) {
        summary.db_groups.push(this.db_groups[i].getSummary());
    };
    return summary;
}

Router.prototype._execByDBGroup = function(client_network) {
    var use_slave = (this.sql_parser.is_read && !client_network.is_in_transaction);
    // prefer to use user specified slice db/table name to route
    var db_group =
        (this.map_slice_db_group[(this.sql_parser.db_name || client_network.db_name)]
        || this.map_slice_db_group[this.sql_parser.table_name]);
    if (db_group) {
        this.db_groups[db_group].execClientReq(use_slave, client_network);
        return;
    };
    var vt;
    for (var i = this.virtual_table.length - 1; i >= 0; i--) {
        var virt = this.virtual_table[i];
        if(!virt.is_table_divided && virt.reg_table_name.test(this.sql_parser.table_name)) {
            vt = virt;
            break;
        } else if(virt.virtual_table_name === this.sql_parser.table_name) {
            vt = virt;
            break;
        }
    };
    // if not virtual table, execute on default db group
    if (!vt) {
        this.default_db_group.execClientReq(use_slave, client_network);
        return;
    };
    var rowkey_values = this.sql_parser.getRowKeyValue(vt.rowkey);
    // all_dest store all dest slices, use dict for redupliction removing
    var all_dest = {};
    for (var i = rowkey_values.length - 1; i >= 0; i--) {
        var dest = vt.getKeyValueInfo(rowkey_values[i]);
        // use db+table as key, duplicate dest will be merged
        all_dest[dest.partition_db_name + dest.partition_table_name] = dest;
    };
    var all_dest_values = _.values(all_dest);
    if (!all_dest_values.length) {
        logger.warn("route failed, rowkey_value: %j", rowkey_values);
        throw MAYA_ERROR.PARTITION_TABLE_NOT_FOUND;
    };
    //logger.trace("all_dest_values", all_dest_values);
    // need to execute on multi slices
    if (all_dest_values.length > 1) {
        if (!this.sql_parser.is_read &&
            (this.multi_query_mode === 1 || client_network.is_in_transaction) ) {
            logger.warn("Multi slice write is not supported");
            throw MAYA_ERROR.MULTI_WRITE_DISABLED;
        };
        if (client_network.is_in_transaction) {
            if (client_network.server_network) {
                logger.warn("change server in transaction is not allowed");
                throw MAYA_ERROR.MULTI_WRITE_DISABLED;
            };
            // allow multi read in transtion, to support force read master
            // but don't communicate with server by transaction
            client_network.is_transaction_started = true;
        };
        client_network.multi_execute_slices = all_dest_values.length;
        client_network.multi_res_packets = [];
    } else if (this.force_read_master_microseconds > 0) {
        // force read master
        if (!use_slave) {
            client_network.last_write_time = Date.now();
            client_network.last_used_group = all_dest_values[0].db_group;
        } else if ((Date.now() - client_network.last_write_time < this.force_read_master_microseconds)
            && client_network.last_used_group === all_dest_values[0].db_group) {
                use_slave = false;
        };
    }
    for (var i = all_dest_values.length - 1; i >= 0; i--) {
        var dest = all_dest_values[i];
        var new_sql = this.sql_parser.replaceTableName(
            dest.partition_db_name || "", dest.partition_table_name || "");
        logger.trace("new sql: %s", new_sql);
        client_network.req_data = maya_tools.createQueryPacket(
                new_sql, client_network.packet_num, client_network.com_num);
        this.db_groups[dest.db_group].execClientReq(use_slave, client_network);
    };
};

Router.prototype.execClientReq = function(client_network) {
    ++this.req_cnt;
    // packet_num > 0 means a subsequent packet of last one, needs keep session
    if (client_network.packet_num > 0) {
        client_network.origin_sql = client_network.req_data;
        client_network.server_network.execClientReq(client_network);
        return;
    };

    switch (client_network.com_num) {
    case com_nums.COM_INIT_DB:
        client_network.db_name = client_network.req_data.toString('binary', 5);
        client_network.execSessionReq();
        return;
    case com_nums.COM_SET_OPTION:
        client_network.execSessionReq();
        return;
    case com_nums.COM_STMT_EXECUTE:
    case com_nums.COM_STMT_RESET:
    case com_nums.COM_STMT_SEND_LONG_DATA:
    case com_nums.COM_STMT_FETCH:
        client_network.execStmt(false);
        return;
    case com_nums.COM_STMT_CLOSE:
        client_network.execStmt(true);
        return;
    case com_nums.COM_QUIT:
        // for mysql_close() from client
        // release the server connection if not in transaction
        // else close server connection in case of not completed transaction
        if (!client_network.is_in_transaction) {
            client_network.releaseServer();
        };
        return;
    default:
        break;
    };

    var sql = (client_network.req_data.length > 5) ?
        client_network.req_data.slice(5) : new Buffer(0);
    client_network.origin_sql = sql;
    this.sql_parser.parse(sql);
    client_network.operation = this.sql_parser.operation;

    // if no tablename for select, needs keep session
    if (!this.sql_parser.table_name &&
        this.sql_parser.is_read &&
        client_network.server_network) {
        client_network.server_network.execClientReq(client_network);
        return;
    };

    switch (this.sql_parser.operation) {
    case SQL_TOKENS.TK_SQL_SET:
        client_network.execSessionReq();
        client_network.setSessionVars(this.sql_parser.getAllTokens());
        return;
    case SQL_TOKENS.TK_SQL_USE:
        client_network.db_name = sql.toString('binary').trim().split(" ").pop();
        client_network.execSessionReq();
        return;
    case SQL_TOKENS.TK_SQL_START:
    case SQL_TOKENS.TK_SQL_BEGIN:
        client_network.is_in_transaction=true;
        // send ok to client
        var res_packet = maya_tools.createOKPacket(client_network.packet_num+1);
        client_network.writePacket(res_packet);
        return;
    case SQL_TOKENS.TK_SQL_COMMIT:
    case SQL_TOKENS.TK_SQL_ROLLBACK:
        client_network.is_in_transaction = false;
        client_network.is_transaction_started = false;
        if (client_network.server_network) {
            client_network.server_network.execClientReq(client_network);
            // transaction end as write, update last write time
            client_network.last_write_time = Date.now();
        } else {
            var res_packet = maya_tools.createOKPacket(client_network.packet_num+1);
            client_network.writePacket(res_packet);
        };
        return;
    default:
        break;
    }

    this._execByDBGroup(client_network);
}

Router.prototype.setToken = function() {
    var packet = maya_tools.getGreetingPacket();
    this.token = maya_tools.generateToken(packet, this.password);
}

Router.prototype.authClient = function(client_network, scramble_buff) {
    var client_conn = client_network.connection;
    if (scramble_buff != this.token) {
        logger.warn("auth client failed, incorrect passwd from %s, maya_user: %s",
            client_network.name, client_network.maya_user);
        return MAYA_ERROR.ACCESS_DENIED;
    };
    var remoteIP = client_conn.remoteAddress;
    if (this.ip_connections[remoteIP] >= this.client_max_conn_num) {
        logger.warn("connections from %s up to the limit!", remoteIP);
        return MAYA_ERROR.IP_CONN_FULL;
    };
    if (!this.ip_connections[remoteIP]) {
        this.ip_connections[remoteIP] = 1;
    } else {
        this.ip_connections[remoteIP]++;
    };
    //logger.trace("auth client success from %s, maya_user: %s", client_network.name, client_network.maya_user);

    var client_key = client_network.name;
    this.clients[client_key] = client_network;
    var self = this;
    client_conn.on('close', function () {
        delete self.clients[client_key];
        self.ip_connections[remoteIP]--;
    });
    return 0;
}

Router.prototype.killLongQuery = function() {
    var start_time = Date.now() - this.kill_long_query_time;
    for (var i in this.clients) {
        this.clients[i].killLongQuery(start_time);
    };
}

//router center

var routers = {};

exports.init = function (cluster_conf) {
    var old_routers = routers;
    routers = {};
    for( var i in cluster_conf) {
        var new_router = new Router();
        new_router.init(cluster_conf[i]);
        new_router.setToken();
        routers[cluster_conf[i].maya_user] = new_router;
    };
    for (var j in old_routers) {
        var r = old_routers[j];
        // refresh client router
        for (var k in r.clients) {
            var c = r.clients[k];
            c.router = routers[c.maya_user];
            c.cleanupUnusedSessions();
        };
        r.cleanup();
    };
}

exports.getRouter = function(client_network, scramble_buff) {
    var auth_ret = MAYA_ERROR.ACCESS_DENIED;
    var r = routers[client_network.maya_user];
    r && (auth_ret = r.authClient(client_network, scramble_buff));
    var res_packet = null;
    if (0 != auth_ret) {
        res_packet = maya_tools.createErrorPacket(
            2, auth_ret, client_network.maya_user);
        client_network.writePacket(res_packet);
        client_network.connection.end();
        return null;
    };
    res_packet = maya_tools.createOKPacket(2);
    client_network.writePacket(res_packet);
    return r;
}

exports.getSummary = function() {
    var summary = [];
    for (var i in routers) {
        summary.push(routers[i].getSummary());
    };
    return summary;
}

exports.cleanup = function() {
    for (var i in routers) {
        routers[i].cleanup();
    };
}
