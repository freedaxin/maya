/**
 * @fileoverview one db group includes one master and several slaves
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2011.12.29
 */

"use strict";

var path = require('path');
var hash = require('mhash').hash;
var ZooKeeper = require('zookeeper');
var _ = require('underscore');
var zk_manager = require('./zk_manager').zk_manager;
var DBInstance = require('./db_instance').DBInstance;
var WORKING_STATUS = require('./monitor').WORKING_STATUS;

function DBGroup(group_conf, default_conf, zk_path) {
    this.name = group_conf.name;
    this.dbs = {};  // all dbs in this group
    this.master = null;
    // select a slave to execute read-only sql using working_slaves.
    this.working_slaves = [];
    this.disabled_slaves = {};  // temp disabled salves
    this.max_disabled_slaves = 0;
    this.zk_path = path.normalize(zk_path + "/" + group_conf.name);
    // ip_hash, default is false;
    this.select_db_by_client_ip = default_conf.select_db_by_client_ip || false;
    this.group_conf = group_conf;
    this.default_conf = default_conf;
    // priority: group conf > default conf > default
    this.change_master_threshold_percent = parseInt(
        group_conf.change_master_threshold_percent ||
        default_conf.change_master_threshold_percent ||
        90);

    var max_disabled_slaves_percent =
        parseInt(group_conf.max_disabled_slaves_percent
                || default_conf.monitor.max_disabled_slaves_percent);
    if (max_disabled_slaves_percent >= 100 || isNaN(max_disabled_slaves_percent)) {
        logger.warn("invalid max_disabled_slaves_percent, reset to default: 0%");
        max_disabled_slaves_percent = 0;
    }
    this.max_disabled_slaves =
        Math.floor((group_conf.dbs.length-1)*max_disabled_slaves_percent/100);
    logger.info("max slaves can be disabled: %d in group %s",
        this.max_disabled_slaves, this.name);
    var self = this;
    zk_manager.on('connected', this._getAndWatchZKDBGroupChildren.bind(this));
    // default run by conf file
    group_conf.dbs.forEach(function(x){
        var db = self._initDBInstances(x);
        db.run();
    });
}

DBGroup.prototype.execClientReq = function(use_slave, client_network) {
    // use previous server network if in transaction
    if (client_network.is_transaction_started && client_network.server_network) {
        client_network.server_network.execClientReq(client_network);
        return;
    };

    var exec_instance = null;
    var sessions = client_network.sessions[this.name];
    if (!sessions) {
        sessions = {'master': null, 'slave': null};
        client_network.sessions[this.name] = sessions;
    };
    if(true === use_slave) {
        client_network.use_slave = true;
        if (sessions.slave) {
            sessions.slave.execClientReq(client_network);
            return;
        };
        if( this.select_db_by_client_ip ) {
            // select same db for same ip.
            var hash_code = parseInt(hash('crc32', client_network.connection.remoteAddress), 16);
            exec_instance = this.working_slaves[hash_code % this.working_slaves.length];
        } else {
            // select random slave
            exec_instance = this.working_slaves[Math.floor(Math.random()*(this.working_slaves.length))];
        };
        if (exec_instance) {
            sessions.slave = exec_instance.getServerNetwork(client_network);
            sessions.slave.execClientReq(client_network, true);
            return;
        };
    };
    // if not use_slave, or no slaves, use master
    if (!exec_instance) {
        client_network.use_slave = false;
        if (sessions.master) {
            sessions.master.execClientReq(client_network);
            return;
        };
        sessions.master = this.master.getServerNetwork(client_network);
        sessions.master.execClientReq(client_network, true);
    };
}

DBGroup.prototype.stop = function() {
    // stop all db instance
    for (var i in this.dbs) {
        this.dbs[i].stop();
    }
}

DBGroup.prototype.getSummary = function() {
    var summary = {};
    summary.name = this.name;
    summary.dbs = [];
    for (var i in this.dbs) {
        var db = this.dbs[i];
        var status = db.getSummary();
        status.err_disabled =
            (this.disabled_slaves[db.host + ":" + db.port] != undefined) ? 1 : 0;
        summary.dbs.push(status);
    };
    return summary;
}

DBGroup.prototype._pauseDB = function(host, port, conn_err) {
    if (!conn_err && _.size(this.disabled_slaves) >= this.max_disabled_slaves) {
        logger.warn("no more than %d slaves can be disabled", this.max_disabled_slaves);
        return;
    };
    logger.warn("slave db paused:  %s:%d", host, port);
    var key = host + ":" + port;
    var disabled = false;
    var self = this;
    // remove broken slave
    this.working_slaves = this.working_slaves.filter(function(element, index, array) {
        // put broken slave into disabled_slaves
        if(element.host === host && element.port === port) {
            self.disabled_slaves[key] = element;
            disabled = true;
            return false;
        };
        return true;
    });
    logger.warn("current disabled_slaves: %d", _.size(this.disabled_slaves));
}

DBGroup.prototype._removeWorkingSlave = function(host, port) {
    // remove slaves already in working list
    this.working_slaves = this.working_slaves.filter(function(element, index, array) {
        return (element.host != host || element.port != port);
    });
    logger.trace("working slaves count: %d, group: %s",
        this.working_slaves.length, this.name);
}

DBGroup.prototype._recoverDB = function(host, port) {
    var key = host + ":" + port;
    this._removeWorkingSlave(host, port);
    logger.warn("slave db recover:  %s:%d", host, port);
    // push into working_slaves by weight
    var weight = this.dbs[key].weight;
    while(--weight >= 0) {
        this.working_slaves.push(this.dbs[key]);
    }
    if (this.disabled_slaves[key]){
        delete this.disabled_slaves[key];
    }
    logger.warn("current disabled_slaves: %d, working slaves count: %d, group: %s",
        _.size(this.disabled_slaves), this.working_slaves.length, this.name);
}

DBGroup.prototype._deleteDB = function(host, port) {
    logger.warn("db deleted, %s:%s", host, port);
    var key = host + ":" + port;
    var db = this.dbs[key];
    if (!db) {
        return;
    };
    db.stop();
    delete this.dbs[key];
    if (this.master && this.master.host === host && this.master.port === port) {
        this.master = null;
    };
    this._removeWorkingSlave(host, port);
    delete this.disabled_slaves[key];
}

DBGroup.prototype._getAndWatchZKDBGroupChildren = function(){
    var self = this;
    zk_manager.connected && zk_manager.zk.aw_get_children(this.zk_path,
        function(type, state, path){
            // zk connection lost or reconnected
            if (ZooKeeper.ZOO_SESSION_EVENT === type) {
                return;
            };
            self._getAndWatchZKDBGroupChildren();
        },
        function(rc, error, children){
            if (0 != rc) {
                logger.warn("_getAndWatchZKDBGroupChildren failed: %s, path: %s", error, self.zk_path);
                return;
            };
            logger.info("children of %s: %j", self.zk_path, children);
            self._onChildrenChange(children);
        }
    );
}

DBGroup.prototype._masterUnavailable = function(){
    if (!this.master ||
        !this.master.monitor ||
        this.master.monitor.working_status === WORKING_STATUS.DB_CONNECTION_ERROR) {
        return true;
    }
    return false;
}

DBGroup.prototype._onChildrenChange = function(children_dbs){
    var self = this;
    if (0 === children_dbs.length) {
        logger.warn("no db in group: %s, ignore", this.name);
        return;
    };
    children_dbs.forEach(function(x){
        // get other db params from zookeeper in db_instance
        var db = self.dbs[x];
        // if db already added, ingnore
        if (db) {
            return;
        };
        //split host:port
        var host_port = x.split(":");
        if (2 != host_port.length) {
            logger.warn("invalid db node: %s", x);
            return;
        };
        var db_addr = {};
        db_addr.host = host_port[0];
        db_addr.port = host_port[1];
        db = self._initDBInstances(db_addr);
        db.getAndWatchZKDBData();
        // add to zk at beginning
        db.addToZKDBNode();
    });
}

DBGroup.prototype._initDBInstances = function(x) {
    var key = x.host + ":" + x.port;
    if (this.dbs[key]) {
        logger.warn("duplicated db: %j, ignored", x);
        return this.dbs[key];
    };
    var self = this;
    var db = new DBInstance(x.host, x.port,
                    this.default_conf.mysql_user,
                    this.default_conf.mysql_passwd,
                    this.group_conf.mysql_db_name,
                    x.weight,
                    this.default_conf.server_conn_wait_timeout,
                    this.default_conf.long_query_time,
                    this.default_conf.client_flags,
                    this.default_conf.server_conn_pool_size,
                    this.default_conf.server_init_commands,
                    x.is_master,
                    this.default_conf.monitor,
                    x.disable_monitor,
                    this.zk_path);
    this.dbs[key] = db;
    db.on('db_fail', function(working_status){
        self._processDBFail(this, working_status);
    });
    db.on('db_recover', function(){
        self._processDBRecover(this);
    });
    db.on("run as master", function(){
        // if it was not master, remove from slaves
        if (db != self.master) {
            logger.warn("%s:%s run as master", db.host, db.port);
            self._removeWorkingSlave(db.host, db.port);
            delete self.disabled_slaves[db.host + ":" + db.port];
        };
        if (!db.online) {
            logger.warn("db %s:%s offline", db.host, db.port);
            db.stop();
            self.master = null;
            return;
        };
        self.master=db;
        db.start();
    });
    db.on("run as slave", function(){
        // if it was master, clear master of this group
        if (db === self.master) {
            self.master = null;
        }
        if (!db.online) {
            logger.warn("db %s:%s offline", db.host, db.port);
            self._removeWorkingSlave(db.host, db.port);
            db.stop();
            return;
        };
        logger.warn("%s:%s run as slave", db.host, db.port);
        self._recoverDB(db.host, db.port);
        db.start();
    });
    db.on("deleted", function(){
        self._deleteDB(db.host, db.port);
    });
    db.on('conn_fail_in_query', function (client_network) {
        // give up if has retried once for a query, or transaction has started
        if (client_network.retried || client_network.is_transaction_started) {
            client_network.processServerError(this.host + ":" + this.port);
            return;
        };
        // retry on current db if it's master, or no slaves
        var new_db = this;
        var new_server_network;
        if (!this.is_master) {
            var slaves = _.shuffle(self.working_slaves);
            for (var i = slaves.length - 1; i >= 0 && new_db === this; i--) {
                new_db = slaves[i];
            };
            new_server_network = new_db.getServerNetwork();
            client_network.sessions[self.name].slave = new_server_network;
        } else {
            new_server_network = new_db.getServerNetwork();
            client_network.sessions[self.name].master = new_server_network;
        };
        // retry 10ms later
        setTimeout(function () {
            logger.trace("retry on db %s:%s for client", new_db.host, new_db.port);
            new_server_network.execClientReq(client_network, true);
            client_network.retried = true;
            if (client_network.connection) {
                client_network.connection.once('data', function () {
                    client_network.retried = false;
                });
            };
        }, 10);
    });
    return db;
}

DBGroup.prototype._processDBFail = function(db, working_status) {
    var conn_err = (working_status === WORKING_STATUS.DB_CONNECTION_ERROR);
    if (db.is_master) {
        // if not connection err, ignore
        if (!conn_err) {
            return;
        };
        db.deleteFromZKDBNode();
        // 1s later, ensure zk operation finished
        setTimeout(db.callDBErrorAPI.bind(db), 1000);
    } else {
        //if master unavailable, ignore slave sync errors
        if (this._masterUnavailable() &&
             (working_status === WORKING_STATUS.SLAVE_IO_ERROR ||
              working_status === WORKING_STATUS.SLAVE_SQL_ERROR ||
              working_status === WORKING_STATUS.SECONDS_BEHIND_MASTER_ERROR)
         ) {
            logger.warn("master unavailable, slave sync error ignored");
            return;
        }
        this._pauseDB(db.host, db.port, conn_err);
        db.deleteFromZKDBNode();
        // 1s later, ensure zk operation finished
        setTimeout(db.callDBErrorAPI.bind(db), 1000);
    }
}

DBGroup.prototype._processDBRecover = function(db) {
    db.addToZKDBNode();
    // 1s later, ensure zk operation finished
    setTimeout(db.callDBErrorAPI.bind(db), 1000);
    if (!db.is_master) {
        this._recoverDB(db.host, db.port);
    }
}

exports.DBGroup = DBGroup;
