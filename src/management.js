/**
 * @fileoverview management interface
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2012.2.16
 */

"use strict";

var cluster = require('cluster');
var http = require('http');
var _ = require('underscore');
var router = require('./router');
var zk_manager = require('./zk_manager').zk_manager;

function ManagementInterface (port) {
    this.port = port;
    this.m_server = null;
};

ManagementInterface.prototype.run = function () {
    var self = this;
    var stats_workers = [];
    var maya_status = {};
    cluster.on('online', function(worker) {
        worker.on('message', function (m) {
            switch (m.cmd) {
            case 'res_dbstatus':
                if (stats_workers.length >= global.WORKER_NUM) {
                    stats_workers = [];
                };
                stats_workers.push(m.data);
                break;
            case 'res_maya_status':
                maya_status = m.data;
                break;
            default:
                break;
            }
        });
    });
    this.m_server = http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        var human =
            require('url').parse(req.url, true).query.human == 0 ? null : 2;
        var cate = require('url').parse(req.url, true).pathname;
        switch (cate) {
        case '/dbstatus/':
            _.each(cluster.workers, function (x) {
                x.send({'cmd': 'get_dbstatus'});
            });
            setTimeout(function () {
                res.end(JSON.stringify(self._statsSummary(stats_workers), null, human));
            }, 300);
            break;
        case '/mayastatus/':
            // get maya status from ramdom worker
            var w = Math.floor(Math.random() * global.WORKER_NUM);
            cluster.workers[_.keys(cluster.workers)[w]].send({'cmd': 'get_maya_status'});
            setTimeout(function () {
                res.end(JSON.stringify(maya_status, null, human));
            }, 300);
            break;
        default:
            res.end('input: \n\t/dbstatus/\n\t/mayastatus/\n');
            break;
        }
    }).listen(this.port);
    this.m_server.on('close', function() {
        self.m_server = null;
        logger.warn('management server conn closed');
    });
    this.m_server.on('listening', function() {
        logger.info('ManagementInterface started on: %j', this.address());
    });
    this.m_server.on('error', function (e) {
        logger.warn('ManagementInterface server connection error: %s', e);
    });
}

ManagementInterface.prototype.stop = function () {
    try {
        this.m_server && this.m_server.close();
        this.m_server = null;
    } catch (e) {
        logger.trace('exception in ManagementInterface.stop', e);
    }
}

ManagementInterface.prototype._statsSummary = function (stats_workers) {
    logger.info('stats_workers:\n%s', JSON.stringify(stats_workers, null, 2));
    // update the first stats by others
    var stats_sum = stats_workers[0];
    // skip first stats
    for (var i = stats_workers.length - 1; i >= 1; i--) {
        _.each(stats_workers[i], function (app) {
            _.each(app.db_groups, function (db_group) {
                _.each(db_group.dbs, function (db_status) {
                    updateDBStats(app.app_name, db_group.name, db_status, stats_sum);
                });
            });
        });
    }
    return stats_sum;
}

function updateDBStats(app_name, db_group_name, db_status, all_db_status) {
    _.some(all_db_status, function (app) {
        if (app.app_name !== app_name) {
            return false;
        };
        _.some(app.db_groups, function (db_group) {
            if (db_group.name !== db_group_name) {
                return false;
            };
            _.some(db_group.dbs, function (db_out) {
                if (db_out.host !== db_status.host || db_out.port !== db_status.port) {
                    return false;
                };
                _.each(db_status.total_querys, function (v, k) {
                    db_out.total_querys[k] += v;
                });
                _.each(db_status.res_time, function (v, k) {
                    if (v > db_out.res_time[k]) {
                        db_out.res_time[k] = v;
                    };
                });
                _.each(db_status.res_time_distribution, function (v, k) {
                    db_out.res_time_distribution[k] += v;
                });
                return true;
            });
            return true;
        });
        return true;
    });
}

exports.ManagementInterface = ManagementInterface;
