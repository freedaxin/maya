#!/usr/local/bin/node

var MasterMonitor= require('../src/monitor.js').MasterMonitor;

describe('test Monitor', function() {
    global.global_conf = require('../conf/maya.json');
    logger = require('log4js').getLogger()

    var db=global_conf.apps[0].db_groups[0].dbs[0];

    var user=global_conf.apps[0].mysql_user;
    var passwd=global_conf.apps[0].mysql_passwd;
    var monitor_conf=global_conf.apps[0].monitor;

    var disable_monitor = 0;

    var monitor = new MasterMonitor(db.host, db.port, user, passwd,
    monitor_conf, disable_monitor);

    monitor.detect();
    //monitor_interval = setInterval(monitor.detect.bind(monitor),
    //monitor_conf.detect_interval_seconds*100);
});
