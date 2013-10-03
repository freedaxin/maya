/**
 * @fileoverview manage client connections
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2011.12.29
 */

"use strict";

var net = require('net');
var router = require('./router');
var client_network = require('./client_network');
var AccessControl = require('./access_control').AccessControl;
var maya_tools = require('./maya_tools');
var MAYA_ERROR = require('./constants').MAYA_ERROR;
var zk_manager = require('./zk_manager').zk_manager;
var buffer = require('buffer');
buffer.INSPECT_MAX_BYTES = 100;

// global variables;
global.project_dir = require('path').dirname(__dirname);
global.log4js = require('log4js');
global.logger = log4js.getLogger();
global.logger_conf_path = project_dir + '/conf/log4js.json';
global.global_conf_path = project_dir + '/conf/maya.json';
// global exit flag
global.terminated = false;
global.heartbeat_interval = 10000;
global.global_conf = require(global_conf_path);
global.cluster_conf = global.global_conf.apps;

// log uncaughtException
process.on('uncaughtException', function(err) {
    logger.fatal('uncaughtException:\n%s', err.stack);
    // exit process when exiting
    if (global.terminated) {
        process.nextTick(function(){
            process.exit(1);
        });
    };
});

try {
    process.setuid("daemon");
} catch (e) {
    logger.warn("failed to set uid to daemon: %s", e);
}
// require webkit-devtools-agent only in debug, not in release version
try {
    var agent = require('webkit-devtools-agent');
} catch(e) {
    logger.trace("webkit-devtools-agent not loaded: %s", e);
}

var ac = new AccessControl();
var maya_worker_id = process.env.worker_id;
var maya_server = null;

main();

function main () {
    init();

    // signal process, cleanup before exit
    process.on('SIGINT', function () {
        process.nextTick(safeExit);
    });
    process.on('SIGTERM', function () {
        process.nextTick(safeExit);
    });
    // ignore SIGPIPE, maybe unnecessary?
    process.on('SIGPIPE', function(){});

    process.on('message', processMessages);

    logger.warn("server process started, pid: %d", process.pid);

    initMayaServerConn(global_conf.client_port);
    // send heart beat message to master process
    setInterval(function sendHeartBeat () {
        process.send && process.send({cmd: "heart_beat"});
    }, global.heartbeat_interval);
}

function initMayaServerConn(port) {
    maya_server = net.createServer(function(c) {
        var remoteIP = c.remoteAddress;
        var cn = new client_network.ClientNetwork(c);
        if (ac.is_allowed(remoteIP) != true) {
            logger.warn("access denied from ip: %s", remoteIP);
            var res_packet = maya_tools.createErrorPacket(0, MAYA_ERROR.IP_DENIED);
            cn.writePacket(res_packet);
            c.end();
            return;
        };
        logger.trace("new connection from: %s pid: %d", cn.name, process.pid);
        cn.startup();
        // force close idle long connection
        c.setTimeout(global_conf.max_idle_time*1000, function(){
            logger.trace("client connection idle timeout: %s %d", this.remoteAddress, this.remotePort);
            this.destroy();
        });
    }).listen(port);
    maya_server.on('close', function() {
        logger.warn("maya_server connection closed");
        maya_server = null;
        safeExit();
        // exit after 100ms, for other cleanups
        setTimeout(process.exit, 100, 0);
    });
    maya_server.on('listening', function() {
        if (this.address().port !== port) {
            logger.fatal("server listened on error port: %d", this.address().port);
            safeExit();
        }
        logger.info("maya_server started on: %j", this.address());
    });
    maya_server.on('error', function(e) {
        logger.fatal("maya_server error: %j", e);
        maya_server = null;
        safeExit();
        // exit after 100ms, for other cleanups
        setTimeout(process.exit, 100, 0);
    });
};

/**
 * safely close
 */
function safeExit() {
    try {
        if (global.terminated) {
            return;
        };
        global.terminated = true;
        logger.fatal("worker %d shutting down...", process.pid);
        maya_server && maya_server.close();
        router.cleanup();
        zk_manager.cleanup();
        // force exit after 60s
        setTimeout(function () {
            process.exit(0);
        }, 60000);
    } catch(e) {
        logger.trace("safeExit exception: %s", e.stack);
        process.exit(1);
    }
}
/**
 * init service by conf file
*/
function init() {
    try {
        delete require.cache[global_conf_path];
        global.global_conf = require(global_conf_path);
        initLog();
        maya_tools.createGreetingPacket();
        global.cluster_conf = global.global_conf.apps;
        ac.init(global_conf.allowed_ip, global_conf.denied_ip);
        zk_manager.cleanup();
        zk_manager.init();
        router.init(global.cluster_conf);
    } catch (e) {
        logger.warn("exception when init client_entry:\n%s", e.stack);
        safeExit();
    }
}

function initLog () {
    try {
        delete require.cache[global.logger_conf_path];
        var log_conf = require(global.logger_conf_path);
        log_conf.appenders.forEach(function (x) {
            if (x.filename) {
                x.filename = x.filename.replace(
                    ".log", ".p" + maya_worker_id + "$&");
            };
            if (x.appender && x.appender.filename) {
                x.appender.filename = x.appender.filename.replace(
                    ".log", ".p" + maya_worker_id + "$&");
            };
        });
        log4js.configure(log_conf);
        global.logger = log4js.getLogger('maya');
        logger.info("write log of pid %s to %s",
            process.pid, log_conf.appenders[0].filename);
    } catch(e) {
        logger.warn("initLog exception:\n%s", e.stack);
        return;
    };
}

function processMessages(m) {
    logger.trace('worker got message:', m);
    switch (m.cmd) {
    case 'get_maya_status':
        var status = {
            'maya_version': require('./package.json').version,
            'node_versions': process.versions,
            'uptime': process.uptime(),
            'memory': process.memoryUsage(),
            'zk_connected': zk_manager.connected,
        };
        process.send({'cmd': 'res_maya_status', 'data': status});
        break;
    case 'get_dbstatus':
        process.send({'cmd': 'res_dbstatus', 'data': router.getSummary()});
        break;
    case 'reload_conf':
        logger.warn("worker process reload conf, pid:", process.pid);
        process.nextTick(init);
        break;
    default:
        break;
    }
}
