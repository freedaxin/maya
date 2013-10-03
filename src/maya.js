/**
 * @fileoverview the entrance of program
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2011.12.29
 */

"use strict";

var cluster = require('cluster');
var ManagementInterface = require('./management').ManagementInterface;

// global variables;
global.project_dir = require('path').dirname(__dirname);
global.log4js = require('log4js');
global.logger = log4js.getLogger();
global.logger_conf_path = project_dir + '/conf/log4js.json';
// global exit flag
global.terminated = false;
global.heartbeat_interval = 10000;
global.global_conf_path = project_dir + '/conf/maya.json';
global.global_conf = require(global_conf_path);
global.WORKER_NUM = require('os').cpus().length;
var management = new ManagementInterface(global_conf.management_port);

initLog();

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

if(cluster.isMaster) {
    runMaster();
}

function runMaster () {
    var package_info = require('./package.json');
    if (process.argv.length >= 3) {
        if (process.argv[2] === "--version" || process.argv[2] === "-v") {
            console.log(package_info.version);
        } else {
            console.log("invalid params");
        }
        process.exit(0);
    }

    // signal process
    // safely exit
    process.on('SIGINT', safeExit);
    process.on('SIGTERM', safeExit);
    // SIGUSR2 for reload conf
    process.on('SIGUSR2', reloadConf);
    process.on('SIGTSTP', reStartWorker);

    // run worker from client_entry.js
    cluster.setupMaster({
      exec : "client_entry.js",
      silent : false
    });

    // fork workers
    for(var i = WORKER_NUM; i > 0; i--) {
        startWorker(i);
    }
    management.run();
}

function startWorker (id) {
    var worker_id = id;
    var child = cluster.fork({'worker_id': id});
    var command = require('util').format('taskset -cp %j %j', id%WORKER_NUM, child.process.pid);
    require('child_process').exec(command, function(error, stdout, stderr) {
        if (error) {
            console.error('taskset failed:\n%j \nstderr:\n%s', error, stderr);
        }
    });
    logger.warn("worker %j started, pid: %j", id, child.process.pid);
    var last_heart_beat_time = Date.now();
    //logger.trace("child worker started, id: %d, pid: %d", child.id, child.process.pid);
    child.on('message', function (msg) {
        //logger.trace("message:", msg);
        if (msg.cmd === 'heart_beat') {
            last_heart_beat_time = Date.now();
        };
    });
    // check heart beat
    var hb_interval = setInterval(function () {
        if (Date.now() - last_heart_beat_time >= 3 * global.heartbeat_interval) {
            logger.fatal("lost heart beat from worker: %d, will be killed...",
                child.process.pid);
            process.kill(child.process.pid, 'SIGKILL');
        }
    }, global.heartbeat_interval);
    child.on('exit', function (code, signal) {
        logger.fatal("worker %d died, code: %d, signal: %s",
            child.process.pid, code, signal);
        // stop check heart beat if worker died
        clearInterval(hb_interval);
        // waiting for all workers exit
        if (global.terminated) {
            // if there are still workers, wait for exit
            for (var id in cluster.workers) {
                return;
            };
            management.stop();
            logger.fatal("master process exit");
            process.exit(0);
            return;
        }
        var alive_workers = 0;
        for (var i in cluster.workers) {
            alive_workers++;
        };
        // if enough alive workers, don't restart
        if (alive_workers >= WORKER_NUM) {
            return;
        };
        // restart 1 second later
        setTimeout(startWorker, 1000, worker_id);
    });
}

function reloadConf() {
    logger.info("recved SIGUSR2 for reload conf");
    initLog();
    for (var id in cluster.workers) {
        cluster.workers[id].send({'cmd': 'reload_conf'});
    };
}

function reStartWorker() {
    logger.info("recved SIGTSTP for restart workers");
    var i = 1;
    for (var id in cluster.workers) {
        if (i <= WORKER_NUM) {
            startWorker(i++);
        };
        process.kill(cluster.workers[id].process.pid);
    }
}

/**
 * safely close
 */
function safeExit() {
    logger.fatal("master process %d received signal, shutting down...", process.pid);
    if (global.terminated) {
        return;
    };
    global.terminated = true;
    for (var id in cluster.workers) {
        process.kill(cluster.workers[id].process.pid);
    }
    // force exit after 1s
    setTimeout(function() {
        process.exit(0);
    }, 1000);
}

function initLog() {
    try {
        var file_name = require(logger_conf_path).appenders[0].filename;
        var log_dir = require('path').dirname(file_name);
        require("child_process").exec("mkdir -p " + log_dir, null, function () {
            require("child_process").exec("chown daemon:daemon -R " + log_dir);
        });
    } catch(e) {
        if (e.message.match(/^EEXIST/) === null) {
            logger.error("create log dir failed. %s", e);
        };
    }
    try {
        delete require.cache[logger_conf_path];
        var log_conf = require(logger_conf_path);
        log4js.configure(log_conf);
        global.logger = log4js.getLogger('maya');
    } catch(e) {
        logger.warn("initLog exception:\n%s", e);
        return;
    };
}
