/**
 * @fileoverview monitor mysql and report status
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2011.12.29
 */

var util = require('util');
var mysql = require('mysql');
var async = require('async');

var WORKING_STATUS = {
    OK: {
        error_code: 0,
        error_desc: "OK"
    },
    /* connect出现error */
    DB_CONNECTION_ERROR: {
        error_code: 401,
        error_desc: "DB_CONNECTION_ERROR"
    },
    /* query出现error */
    DB_QUERY_ERROR: {
        error_code: 101,
        error_desc: "DB_QUERY_ERROR"
    },
    /* query无error，返回数据集为空值 */
    DB_NO_STATUS: {
        error_code: 102,
        error_desc: "DB_NO_STATUS"
    },
    /* mysql 连接数过多 */
    DB_TOO_MANY_CONNECTIONS: {
        error_code: 103,
        error_desc: "DB_TOO_MANY_CONNECTIONS"
    },
    SLAVE_NO_STATUS: {
        error_code: 301,
        error_desc: "SLAVE_NO_STATUS"
    },
    SLAVE_IO_ERROR: {
        error_code: 302,
        error_desc: "SLAVE_IO_ERROR"
    },
    SLAVE_SQL_ERROR: {
        error_code: 303,
        error_desc: "SLAVE_SQL_ERROR"
    },
    SECONDS_BEHIND_MASTER_ERROR: {
        error_code: 304,
        error_desc: "SECONDS_BEHIND_MASTER_ERROR"
    }
}

function MonitorDBInstance(host, port,
                            user, passwd, monitor_conf,
                            disable_monitor) {
    this.params = {};
    this.params.host = host;
    this.params.port = port;
    this.params.user = user;
    this.params.password = passwd;
    this.params.insecureAuth = true;
    // todo: process connect/read time out of mysql conn
    this.first_err_time = 0;
    this.monitor_conf = monitor_conf;
    this.working_status = WORKING_STATUS.OK;
    this.db_status = {};
    /* for the judgement of slave's set status */
    this.db_status.Threads_connected = 0;
    this.disable_monitor = disable_monitor || 0;
    this.fail_emitted = false;
}

util.inherits(MonitorDBInstance, process.EventEmitter);

// virtual function
MonitorDBInstance.prototype._setStatus = function(err, results) {
}

MonitorDBInstance.prototype.detectConn = function(callback) {
    var self = this;
    this.db_client = mysql.createConnection(this.params);
    this.db_client.connect(function(err, results, fields) {
        if(err) {
            callback(WORKING_STATUS.DB_CONNECTION_ERROR, 'detectConn');
            return;
        }
        callback(null, 'detectConn');
    });
    // the module node-mysql doesn't provide connection/query timeout
    // in version 2.0.0-alpha5 yet, before this available,
    // we have to set timeout manually.
    this.db_client._socket.setTimeout(
        this.monitor_conf.detect_interval_seconds*1000,
        function () {
            logger.warn("monitor db connection timeout, %s:%d",
                self.params.host, self.params.port);
            this.destroy();
            callback(WORKING_STATUS.DB_CONNECTION_ERROR, 'detectConn');
        }
    );
    this.db_client.on('error', function(err) {
        logger.warn("db %s:%d error:\n%j", self.params.host, self.params.port, err);
    });
}

MonitorDBInstance.prototype.detectConnectionNumber = function(callback) {
    var self = this;
    this.db_client.query("show status like 'Threads_connected'", function(err, results, fields) {
        if (err) {
            logger.info("show status like 'Threads_connected' error:\n", err.message);
            /* clean the last value. */
            delete self.db_status.Threads_connected;
            callback(WORKING_STATUS.DB_QUERY_ERROR, 'detectConnectionNumber');
            return;
        }

        //logger.debug(results);
        if (0 === results.length) {
            delete self.db_status.Threads_connected;
        } else {
            self.db_status.Threads_connected = results[0].Value;
        }
        callback(null, 'detectConnectionNumber');
    });
}

MonitorDBInstance.prototype._processDBError = function() {
    var self = this;
    // if disable_monitor, only db connection err treated as real err
    if (self.working_status != WORKING_STATUS.DB_CONNECTION_ERROR && self.disable_monitor) {
        self._processDBOK();
        return;
    };
    logger.warn('db %s:%d error: %s', self.params.host,
            self.params.port, self.working_status.error_desc);

    if(true === self.fail_emitted) {
        return;
    }
    if(0 === self.first_err_time) {
        self.first_err_time = Date.now();
    }
    var db_err_duration = (Date.now() - self.first_err_time)/1000;
    if(db_err_duration >= self.monitor_conf.conn_fail_max_seconds) {
        /* disabled monitor, report only, no action. */
        if (self.disable_monitor) {
            return;
        }
        logger.warn("db %s:%d error duration: %s", self.params.host,
                self.params.port, db_err_duration);
        self._confirmDBError();
    }
}

MonitorDBInstance.prototype._confirmDBError = function() {
    this.emit('db_fail');
    this.fail_emitted = true;
}

MonitorDBInstance.prototype._processDBOK = function() {
    this.first_err_time = 0;
    if (this.fail_emitted) {
        logger.warn("db recover: %s:%d", this.params.host, this.params.port);
        this.emit('db_recover');
        this.fail_emitted = false;
    }
}

// Master
function MasterMonitor(host, port,
        user, passwd, monitor_conf, disable_monitor) {
    MonitorDBInstance.call(this, host, port,
        user, passwd, monitor_conf, disable_monitor);
    this.is_master = 1;
}
util.inherits(MasterMonitor, MonitorDBInstance);

MasterMonitor.prototype.detect = function() {
    async.series([
        this.detectConn.bind(this),
        this.detectConnectionNumber.bind(this),
        ], this._setStatus.bind(this));
}

MasterMonitor.prototype._setStatus = function(err, results) {
    var self = this;
    if(err) {
        self.working_status = err;
    } else {
        if ( self.db_status.Threads_connected === undefined ) {
            self.working_status = WORKING_STATUS.DB_NO_STATUS;
        } else if (self.db_status.Threads_connected > self.monitor_conf.server_max_connections) {
            self.working_status = WORKING_STATUS.DB_TOO_MANY_CONNECTIONS;
        } else {
            // no error, connect ok, reset fail time
            self.working_status = WORKING_STATUS.OK;
            self._processDBOK();
            self.db_client.end();
            return;
        }
    }
    self._processDBError();
    self.db_client.end();
}

// Slave
function SlaveMonitor(host, port,
        user, passwd, monitor_conf, disable_monitor) {

    MonitorDBInstance.call(this, host, port,
        user, passwd, monitor_conf, disable_monitor);

    this.db_status.Slave_IO_Running = 'Yes';
    this.db_status.Slave_SQL_Running = 'Yes';
    this.db_status.Seconds_Behind_Master = '0';
    this.is_master = 0;
}

util.inherits(SlaveMonitor, MonitorDBInstance);

SlaveMonitor.prototype.detect = function() {
    async.series([
        this.detectConn.bind(this),
        this.detectConnectionNumber.bind(this),
        this.detectSlaveSyn.bind(this),
        ], this._setStatus.bind(this));
}

SlaveMonitor.prototype.detectSlaveSyn = function(callback) {
    var self = this;
    this.db_client.query("show slave status", function(err, results, fields) {
        if (err) {
            logger.info("db %s:%d show slave status error:\n%s",
                self.params.host, self.params.port, err.message);
            delete self.db_status.Slave_IO_Running;
            delete self.db_status.Slave_SQL_Running;
            delete self.db_status.Seconds_Behind_Master;
            callback(WORKING_STATUS.DB_QUERY_ERROR, 'detectSlaveSyn');
            return;
        }

        if (0 === results.length) {
            delete self.db_status.Slave_IO_Running;
            delete self.db_status.Slave_SQL_Running;
            delete self.db_status.Seconds_Behind_Master;
        } else {
            self.db_status.Slave_IO_Running = results[0].Slave_IO_Running.toString();
            self.db_status.Slave_SQL_Running = results[0].Slave_SQL_Running.toString();
            self.db_status.Seconds_Behind_Master = results[0].Seconds_Behind_Master;
        }

        callback(null, 'detectSlaveSyn');
    });
}

SlaveMonitor.prototype._startSlave = function() {
    var self = this;
    if(this.disable_monitor) {
        return;
    }
    this.db_client.query("slave start", function(err, results, fields) {
        if(err) {
            logger.warn("start slave %s:%d failed", self.params.host, self.params.port);
        }
        logger.info("start slave %s:%d succeed", self.params.host, self.params.port);
    });
}

SlaveMonitor.prototype._setStatus = function(err, results) {
    var self = this;

    if(err) {
        self.working_status = err;
    } else {
        if ( self.db_status.Threads_connected === undefined ) {
            self.working_status = WORKING_STATUS.DB_NO_STATUS;
        } else if ( self.db_status.Slave_IO_Running === undefined ) {
            self.working_status = WORKING_STATUS.SLAVE_NO_STATUS;
            // Do nothing. only results.length is 0 can go here. And the working_status shoule have been SLAVE_NO_STATUS.

        } else if ( self.db_status.Slave_IO_Running != "Yes" ) {
            self.working_status = WORKING_STATUS.SLAVE_IO_ERROR;
            self._startSlave();

        } else if (self.db_status.Slave_SQL_Running != "Yes" ) {
            self.working_status = WORKING_STATUS.SLAVE_SQL_ERROR;
            self._startSlave();

        } else if (self.db_status.Seconds_Behind_Master
                >= self.monitor_conf.slave_max_delay_seconds) {
            self.working_status = WORKING_STATUS.SECONDS_BEHIND_MASTER_ERROR;

        } else if (self.db_status.Threads_connected
                > self.monitor_conf.server_max_connections) {
            self.working_status = WORKING_STATUS.DB_TOO_MANY_CONNECTIONS;
        } else {
            // no error, connect ok, reset fail time
            self.working_status = WORKING_STATUS.OK;
            self._processDBOK();
            self.db_client.end();
            return;
        }
    }
    self._processDBError();
    self.db_client.end();
}

exports.MasterMonitor = MasterMonitor;
exports.SlaveMonitor = SlaveMonitor;
exports.WORKING_STATUS = WORKING_STATUS;
