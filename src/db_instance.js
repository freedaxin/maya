/**
 * @fileoverview db instance refers to a mysql instance serving on host:port
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2011.12.29
 */

"use strict";

var net = require('net');
var util = require('util');
var path = require('path');
var http = require('http');
var _ = require('underscore');
var ZooKeeper = require('zookeeper');
var zk_manager = require('./zk_manager').zk_manager;
var ServerNetwork = require('./server_network').ServerNetwork;
var MasterMonitor = require('./monitor').MasterMonitor;
var SlaveMonitor = require('./monitor').SlaveMonitor;
var WORKING_STATUS = require('./monitor').WORKING_STATUS;
var maya_tools = require('./maya_tools');
var SQL_TOKENS = require('./constants').SQL_TOKENS;

var PRESET_RES_TIME_STEPS = [10, 30, 50, 100, 300, 500, 1000];
// max long query logs in a stat interval
var MAX_LONG_QUERY_LOGS = 300;

function DBInstance(host, port, user, passwd, db_name, weight,
    conn_wait_timeout, long_query_time, client_flags, conn_pool_size, init_commands,
    is_master, monitor_conf, disable_monitor, zk_path) {
    this.host = host;
    this.port = port;
    this.db_name = (db_name === undefined ? "" : db_name);
    this.user = user;
    this.passwd = passwd || "";
    this.conn_wait_timeout = (conn_wait_timeout === undefined ? 30 : conn_wait_timeout);
    this.long_query_time = (long_query_time === undefined ? 0 : long_query_time);
    this.client_flags = client_flags || "";
    this.available_conn_num = (conn_pool_size === undefined ? 2048 : conn_pool_size);
    this.init_commands = init_commands;
    // mark for discard of this instance when reload conf
    this.is_stopped = false;
    // dbstatus, online or offline
    this.online = true;

    this.server_networks = [];
    this.binded_server_networks = [];
    this.is_master = (is_master === undefined ? 0 : is_master);
    // default read weight to slave is 10.
    this.weight = (weight === undefined ? 10 : weight);
    this.monitor_conf = monitor_conf;
    this.disable_monitor = disable_monitor;
    // for stats
    this.stats = {
        "total_querys": {
            "all": 0,
            "select": 0,
            "insert": 0,
            "update": 0,
            "delete": 0,
            "replace": 0,
        },
        "res_time": {
            "avg": 0,
            "max": 0,
            "min": 0,
            "95_avg": 0,
            "95_max": 0,
            "99_avg": 0,
            "99_max": 0,
        },
        "res_time_distribution": {
        },
        "timestamp": 0,
    };
    this.res_times = [];
    this.res_time_steps = [];
    if (this.long_query_time === 0) {
        this.res_time_steps = PRESET_RES_TIME_STEPS;
    } else {
        for (var i = 0; i <= PRESET_RES_TIME_STEPS.length - 1; i++) {
            if (PRESET_RES_TIME_STEPS[i] < this.long_query_time) {
                this.res_time_steps.push(PRESET_RES_TIME_STEPS[i]);
            } else {
                break;
            };
        };
        this.res_time_steps.push(this.long_query_time);
    }
    this.res_time_distribution = [];
    // length = this.res_time_steps + 1, for res_time large than max
    for (var i = this.res_time_steps.length; i >= 0; i--) {
        this.res_time_distribution.push(0);
    };

    for (var i = 0; i < this.res_time_steps.length; i++) {
        var step_str = this.res_time_steps[i] + "ms";
        this.stats.res_time_distribution[step_str] = 0;
    };
    var step_str = _.last(this.res_time_steps) + "+ms";
    this.stats.res_time_distribution[step_str] = 0;

    // stats interval
    this.inter_stats = null;

    this.zk_path = path.normalize(zk_path + "/" + host + ":" + port);
    var self = this;
    // if zk connected or reconnected, init zk data
    zk_manager.on('connected', function () {
        self.getAndWatchZKDBData();
        if (self.monitor.fail_emitted) {
            //emit fail to be processed by db group
            self.emit('db_fail', self.monitor.working_status)
        } else {
            self.addToZKDBNode();
        }
    });
    logger.trace("DBInstance init finished %s:%d", this.host, this.port);
};

util.inherits(DBInstance, process.EventEmitter);

DBInstance.prototype.getServerNetwork = function(client_network) {
    if (this.available_conn_num <= 0) {
        logger.warn("server conn pool reach the max connection num: %d %s:%d",
            cluster_conf.conn_pool_size, this.host, this.port);
        client_network.connection.destroy();
        return;
    };

    var self = this;
    var server_network = null;
    var my_db_name = this.db_name;

    // todo: recyle closed server networks for reuse
    while(this.server_networks.length > 0) {
        server_network = this.server_networks.pop();
        // if no connection, then it's dead, discarded
        if(server_network.connection) {
            break;
        }
    };

    if(!server_network || !server_network.connection) {
        server_network = new ServerNetwork(
            this.host, this.port, this.user, this.passwd, my_db_name, this.init_commands,
            this.conn_wait_timeout, this.client_flags, this.reportRes.bind(this));
        this.binded_server_networks.push(server_network);
        this.available_conn_num--;
        server_network.on('release', function() {
            if (self.is_stopped) {
                this.cleanup();
            } else {
                logger.trace("server network released %s:%d %s", self.host, self.port, this.db_name);
                self.server_networks.push(this);
            }
        });
        server_network.once('dead', function(){
            var index = self.binded_server_networks.indexOf(this);
            if( index > -1) {
                self.binded_server_networks.splice(index, 1);
            }
            this.removeAllListeners();
            self.available_conn_num++;
            logger.trace("server conn closed, available_conn_num %d for %s:%d",
                self.available_conn_num, self.host, self.port);
        });
        server_network.on('conn_fail_in_query', function (client_network) {
            self.emit('conn_fail_in_query', client_network);
        });
    };
    return server_network;
}

DBInstance.prototype.start = function() {
    this.is_stopped = false;
    // stats interval 60s
    this.inter_stats = setInterval(this.doStats.bind(this), 60000);
    // if monitor started as required, skip
    if ((this.is_master && this.monitor instanceof MasterMonitor) ||
        (!this.is_master && this.monitor instanceof SlaveMonitor)) {
        return;
    };
    this.monitor_interval && clearInterval(this.monitor_interval);
    this.monitor && this.monitor.removeAllListeners();
    if (this.is_master) {
        this.monitor = new MasterMonitor(this.host, this.port, this.user, this.passwd,
            this.monitor_conf, this.disable_monitor);
    } else {
        // close all binded conns
        this.binded_server_networks.forEach(function(s) {
            s.cleanup();
        });
        this.binded_server_networks = [];
        this.monitor = new SlaveMonitor(this.host, this.port, this.user, this.passwd,
            this.monitor_conf, this.disable_monitor);
    }
    this.addToZKDBNode();
    this._startMonitor();
}

DBInstance.prototype.stop = function() {
    if (true === this.is_stopped) {
        return;
    };
    logger.info("instance of %s:%d is stopped", this.host, this.port);
    this.is_stopped = true;
    // close all idle server conns
    this.server_networks.forEach(function(x) {
        x.cleanup();
    });
    this.server_networks = [];
    this.monitor_interval && clearInterval(this.monitor_interval);
    this.monitor_interval = null;
    this.monitor = null;

    this.inter_stats && clearInterval(this.inter_stats);
    this.inter_stats = null;

    this.deleteFromZKDBNode();
}

DBInstance.prototype.getSummary = function() {
    var summary = {};
    summary.host = this.host;
    summary.port = this.port;
    summary.is_master = this.is_master;
    summary.db_status = (this.monitor && this.monitor.db_status);
    summary.working_status = {};
    if (this.monitor) {
        // deep copy
        summary.working_status.error_code = this.monitor.working_status.error_code;
        summary.working_status.error_desc = this.monitor.working_status.error_desc;
    };
    summary.disable_monitor = (this.monitor && this.monitor.disable_monitor);
    summary.total_querys = this.stats.total_querys;
    summary.res_time = this.stats.res_time;
    summary.res_time_distribution = this.stats.res_time_distribution;
    summary.stats_timestamp = this.stats.timestamp;

    return summary;
}

DBInstance.prototype.callDBErrorAPI = function() {
    var self = this;
    var retry_timeout = null;
    function retry () {
        if (self.is_stopped) {
            clearTimeout(retry_timeout);
            retry_timeout = null;
            return;
        };
        logger.warn("retry after 10 seconds");
        retry_timeout = setTimeout(self.callDBErrorAPI.bind(self), 10000);
    };
    try {
        var api_addr = global.global_conf.maya_api_host.split(":");
        var options = {};
        options.host = api_addr[0];
        options.port = api_addr[1];
        options.path = util.format(
            "/mon_center?a=db_error_process&host=%s&port=%d&error_code=%d&error_desc=%s",
            this.host, this.port, this.monitor.working_status.error_code,
            this.monitor.working_status.error_desc);
        logger.warn("call db_error_process api: %s", options.path);
        http.get(options, function(res) {
            logger.warn("call db_error_process api statusCode: %s", res.statusCode);
            res.on('data', function (chunk) {
                var res_json = {};
                try {
                    res_json = JSON.parse(chunk.toString());
                } catch (e) {
                    logger.warn("no json res, err:", e);
                    retry();
                    return;
                }
                if (res_json.status != 1) {
                    logger.warn("call db_error_process api fail: %s", chunk.toString());
                    retry();
                } else {
                    logger.warn("call db_error_process api success: %j", res_json);
                }
            });
        }).on('error', function(e) {
            logger.warn("call db_error_process api error: %j", e);
            retry();
        }).setTimeout(30000, function(){
            logger.warn("call db_error_process api 30s timeout");
            this.abort();
            // abort will emit error and retry
        });
    } catch (e) {
        if (this.is_stopped) {
            return;
        };
        logger.fatal("call db_error_process api exception:", e);
        retry();
    }
}

DBInstance.prototype.addToZKDBNode = function(){
    var p = path.normalize(this.zk_path + "/"
                + maya_tools.getIP() + ":" + process.pid);
    zk_manager.connected && zk_manager.zk.a_create(p, "", ZooKeeper.ZOO_EPHEMERAL, function (rc, error, path) {
        if (0 === rc) {
            logger.info("addToZKDBNode ok, path=%s", path);
        } else if (rc === ZooKeeper.ZNODEEXISTS) {
            logger.info("zk path already exists %s", p);
        } else {
            logger.warn("addToZKDBNode failed, result: %d, error: '%s', path=%s",
                rc, error, p);
        }
    });
}

DBInstance.prototype.deleteFromZKDBNode = function(){
    var p = path.normalize(this.zk_path + "/"
                + maya_tools.getIP() + ":" + process.pid);
    zk_manager.connected && zk_manager.zk.a_delete_(p, 0, function (rc, error) {
        if (0 === rc) {
            logger.info("_deleteFromDBPath ok, path=%s", p);
        } else {
            logger.warn("_deleteFromDBPath failed, result: %d, error: '%s', paht:%s",
                rc, error, p);
        }
    });
}

DBInstance.prototype.getAndWatchZKDBData = function(){
    var self = this;
    zk_manager.connected && zk_manager.zk.aw_get(this.zk_path,
        function(type, state, path){
            // zk connection lost or reconnected
            if (ZooKeeper.ZOO_SESSION_EVENT === type) {
                return;
            };
            logger.trace("data watched: %s", self.zk_path, arguments);
            self.getAndWatchZKDBData();
        },
        function(rc, error, stat, data) {
            if (0 != rc) {
                logger.warn("get data from zk failed: %s, path: %s", error, self.zk_path);
                if (rc === ZooKeeper.ZNONODE) {
                    self.emit('deleted');
                };
                return;
            }
            logger.info("zk data of %s:%s, %s", self.host, self.port, data);
            try {
                data = JSON.parse(data.toString());
                (data.is_master != undefined) && (self.is_master = data.is_master);
                (data.weight != undefined) && (self.weight = data.weight);
                (data.disable_monitor != undefined) && (self.disable_monitor = data.disable_monitor);
                (data.db_status != undefined) && (self.online = !(0 === data.db_status));
            } catch (e) {
                logger.warn("exception in process zk data: %s, data: %s", e, data);
            }
            self.run();
        });
}

DBInstance.prototype.run = function(){
    if(this.is_master === 1){
        this.emit('run as master');
    } else {
        this.emit('run as slave');
    }
}

DBInstance.prototype._startMonitor = function() {
    var self = this;
    this.monitor.on("db_fail", function(){
        logger.warn("db_fail emitted,", self.host, self.port);
        self.emit('db_fail', self.monitor.working_status);
    });
    this.monitor.on("db_recover", function(){
        logger.warn("db_recover emitted,", self.host, self.port);
        self.emit('db_recover');
    });
    this.monitor.detect();
    this.monitor_interval = setInterval(this.monitor.detect.bind(this.monitor),
        this.monitor_conf.detect_interval_seconds*1000);
}

DBInstance.prototype.reportRes = function(client_network) {
    this.res_times.push(client_network.res_time);

    this.stats.total_querys.all++;
    switch (client_network.operation) {
        case SQL_TOKENS.TK_SQL_SELECT:
            this.stats.total_querys.select++;
            break;
        case SQL_TOKENS.TK_SQL_INSERT:
            this.stats.total_querys.insert++;
            break;
        case SQL_TOKENS.TK_SQL_UPDATE:
            this.stats.total_querys.update++;
            break;
        case SQL_TOKENS.TK_SQL_DELETE:
            this.stats.total_querys.delete++;
            break;
        case SQL_TOKENS.TK_SQL_REPLACE:
            this.stats.total_querys.replace++;
            break;
        default:
            break;
    };

    for (var i = 0; i < this.res_time_steps.length; i++) {
        if (client_network.res_time <= this.res_time_steps[i]) {
            break;
        };
    }
    this.res_time_distribution[i]++;

    if (this.long_query_time &&
        client_network.res_time >= this.long_query_time &&
        _.last(this.res_time_distribution) <= MAX_LONG_QUERY_LOGS) {
        logger.info("req from user: [%s], addr: [%s], res_time: [%sms][slow query], sql: %s",
            client_network.maya_user, client_network.name,
            client_network.res_time, client_network.origin_sql);
    } else {
        logger.debug("req from user: [%s], addr: [%s], res_time: [%sms], sql: %s",
            client_network.maya_user, client_network.name,
            client_network.res_time, client_network.origin_sql);
    };
}

DBInstance.prototype.doStats = function() {
    _.forEach(this.stats.res_time, function (v, k, obj) {
        obj[k] = 0;
    });
    _.forEach(this.stats.res_time_distribution, function (v, k, obj) {
        obj[k] = 0;
    });
    this.stats.timestamp = Date.now();

    if (0 === this.res_times.length) {
        return;
    };
    // use last 1000 reqs to do stats
    this.res_times = _.last(this.res_times, 1000);
    this.res_times.sort(function (a, b) {
        return a - b;
    });

    var idx_95_end = Math.floor(this.res_times.length * 0.95);
    this.stats.res_time["95_max"] = this.res_times[idx_95_end];
    for (var i = idx_95_end; i >= 0; i--) {
        this.stats.res_time["95_avg"] += this.res_times[i];
    };

    var idx_99_end = Math.floor(this.res_times.length * 0.99);
    this.stats.res_time["99_max"] = this.res_times[idx_99_end];
    this.stats.res_time["99_avg"] = this.stats.res_time["95_avg"];
    for (var i = idx_99_end; i > idx_95_end; i--) {
        this.stats.res_time["99_avg"] += this.res_times[i];
    };

    this.stats.res_time.max = this.res_times[this.res_times.length - 1];
    this.stats.res_time.min = this.res_times[0];
    this.stats.res_time.avg = this.stats.res_time["99_avg"];
    for (var i = this.res_times.length - 1; i > idx_99_end; i--) {
        this.stats.res_time.avg += this.res_times[i];
    };

    this.stats.res_time["95_avg"] = Math.floor(this.stats.res_time["95_avg"] / (idx_95_end + 1));
    this.stats.res_time["99_avg"] = Math.floor(this.stats.res_time["99_avg"] / (idx_99_end + 1));
    this.stats.res_time.avg = Math.floor(this.stats.res_time.avg / this.res_times.length);


    for (var i = 0; i < this.res_time_steps.length; i++) {
        var step_str = this.res_time_steps[i] + "ms";
        this.stats.res_time_distribution[step_str] = this.res_time_distribution[i];
    };
    var step_str = _.last(this.res_time_steps) + "+ms";
    this.stats.res_time_distribution[step_str] = _.last(this.res_time_distribution);

    this.res_times = [];
    for (var i = this.res_time_distribution.length - 1; i >= 0; i--) {
        this.res_time_distribution[i] = 0;
    };
}

/*
DBInstance.prototype._getAndWatchZKDBChildren = function(){
    var self = this;
    zk_manager.zk.aw_get_children(this.zk_path,
        function(type, state, path){
            // zk connection lost
            if (ZooKeeper.ZOO_SESSION_EVENT === type &&
                ZooKeeper.ZOO_CONNECTING_STATE === state) {
                    return;
            };
            self._getAndWatchZKDBChildren();
        },
        this._onZKDBChildren.bind(this));
}
*/

/*
DBInstance.prototype._onZKDBChildren = function(rc, error, children){
    if (0 != rc) {
        logger.warn("get children error: '%s', result: %d, path", error, rc, this.zk_path);
        return;
    };
    logger.info("zk children num: %s of db: %s:%s",
        children.length, this.host, this.port);
    var master_fail_percent = (1-children.length/zk_manager.maya_node_num)*100;
    if (master_fail_percent > this.change_master_threshold_percent) {
        logger.warn("master %s:%s fail percent: %s%(%d/%d)",
        this.master.host, this.master.port, master_fail_percent,
        zk_manager.maya_node_num-children.length, zk_manager.maya_node_num);
        // change master by api service
    };
}
*/

exports.DBInstance = DBInstance;
