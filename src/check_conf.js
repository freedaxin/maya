"use strict";

var router = require('./router');
var net = require('net');

var project_dir = require('path').dirname(__dirname);
global.log4js = require('log4js');

var layout = new log4js.layouts.patternLayout("%m");
var appender = new log4js.appenders.console(layout);
log4js.clearAppenders();
log4js.addAppender(appender);

global.logger = log4js.getLogger();
logger.setLevel("error");

try {
    global.global_conf = require('../conf/maya.json');
    var apps = global.global_conf.apps;
} catch(e) {
    logger.error("invalid json file, error:", e);
    process.exit(1);
}
global.cluster_conf = apps;

function CheckConfig() {
    this.is_ok = true;
}

CheckConfig.prototype.check = function(db_cluster) {
    /* check port */
    if (global_conf.client_port == global_conf.management_port) {
        logger.error("client_port and management_port should not be same!");
    }
    this.checkPort(global_conf.client_port);
    this.checkPort(global_conf.management_port);

    var group_names = {};
    //var sockets = {};

    for (var i in db_cluster.db_groups) {
        var group = db_cluster.db_groups[i];
        var group_name = group.name;

        if (group_names[group_name]) {
            logger.error("db group name: %s has been used before!", group_name);
            this.is_ok = false;
        } else {
            group_names[group_name] = 1;
        }

        /* check max disable slaves percent */
        //var dis_percent = group.max_disabled_slaves_percent;
        //this.checkPercent(dis_percent);

        var master = 0;
        for (var i in group.dbs) {
            var db = group.dbs[i];
            if(net.isIP(db.host) == 0 ) {
                logger.error("invalid ip address: %s", db.host);
                this.is_ok = false;
            }
            this.checkPort(db.port);

            if (db.is_master == "1") {
                if (master === 1) {
                    logger.error("master should be only one!");
                    this.is_ok = false;
                }
                master = 1;
            }
            /*
            key = db.host + ":" + db.port;
            if (sockets[key]) {
                logger.error("%s:%s has been used before!", db.host, db.port);
                this.is_ok = false;
            } else {
                sockets[key] = 1
            }
            */
        }
        if (master === 0) {
            logger.error("master should be choosed!");
            this.is_ok = false;
        }
    }

    var dis_percent = db_cluster.monitor.max_disabled_slaves_percent;
    this.checkPercent(dis_percent);

    if (db_cluster.server_conn_wait_timeout < 5) {
        logger.error("server_conn_wait_timeout shoule not be small than 5.");
        this.is_ok = false;
    }

    setTimeout(function() {}, 1000);

    if (this.is_ok == false) {
        logger.fatal("configure error! Please check again.");
        process.exit(1);
    }
    process.exit(0);
}

CheckConfig.prototype.checkPort = function(port) {
    if (port < 0 || port > 65535) {
        logger.error("invalid port: %s", port);
        this.is_ok = false;
    }
}

CheckConfig.prototype.checkPercent = function(percent) {
    if (percent === undefined) {
        logger.error("max_disabled_slaves_percent is undefined.");
        this.is_ok = false;
        return;
    }
    var percent_num = parseInt(percent);

    if (percent_num < 0 || percent_num >= 100 ) {
        logger.error("max disabled slaves percent error");
        this.is_ok = false;
    }
}

var ck = new CheckConfig();

for( var i in apps) {
    ck.check(apps[i]);
}

try {
    router.init(cluster_conf);
} catch(e) {
    logger.error("router init error!");
    is_ok = false;
}
