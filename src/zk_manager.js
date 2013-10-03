/**
 * @fileoverview zookeeper connection management, get maya chilerdn nodes num
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2011.12.29
 */

var util = require('util');
var path = require('path');
var dns = require('dns');
var ZooKeeper = require("zookeeper");
var maya_tools = require('./maya_tools');

function ZKManager(){
    this.zk = null;
    this.maya_nodes_path = "";
    this.my_node_path = "";
    this.maya_node_num = 1;
    this.zk_ips = [];
    this.connected = false;
    this.terminated = false;
}

util.inherits(ZKManager, process.EventEmitter);

ZKManager.prototype.init = function(){
    if (!global.global_conf.zk_conf) {
        return;
    };
    var self = this;
    this.terminated = false;
    this.maya_nodes_path = path.normalize(global.global_conf.zk_conf.maya_zk_path
        + "/" + "maya_nodes");
    this.my_node_path = path.normalize(this.maya_nodes_path + "/"
        + maya_tools.getIP() + ":" + process.pid);
    this.setMaxListeners(1000);
    // if close before connected, the process will crash, for bug of zookeeper
    if (this.connected) {
        this.zk.removeAllListeners();
        this.zk.close();
        this.connected = false;
    };
    // if zk zddr is domain, resolve it and use all ips
    // if the first addr is domain, ignore others
    var zk_addr_parse = global.global_conf.zk_conf.connect.split(/\s|:|,/);
    dns.resolve4(zk_addr_parse[0], function (err, addresses) {
        if (err) {
            logger.warn("resolve dns of zk: %s failed: %j", zk_addr_parse[0], err);
            // failed maybe ips, use it to connect directly
        } else {
            var zk_addr_by_ip = "";
            addresses.forEach(function(x){
                zk_addr_by_ip += (x+":"+zk_addr_parse[1]+",");
            });
            global.global_conf.zk_conf.connect = zk_addr_by_ip;
            logger.info("zk addr: %s", zk_addr_by_ip);
        }
        self.zk = new ZooKeeper(global.global_conf.zk_conf);
        self._connect();
        self.zk.on('close', function () {
            if (self.terminated) {
                return;
            };
            logger.warn("zk closed, reconnect...");
            self.connected = false;
            // retry init 1000ms later
            setTimeout(self.init.bind(self), 1000);
        });
        self.zk.on('connecting', function() {
            logger.warn("zk connecting...");
            self.connected = false;
        });
        self.zk.on('connect', function() {
            logger.warn("zk connected");
            self.connected = true;
        });
    });
};

ZKManager.prototype._connect = function(){
    var self = this;
    this.zk.connect(function(err){
        if(err) {
            logger.warn("connect to zk failed: %s", err);
            // retry connect 5000ms later
            setTimeout(self.init.bind(self), 5000);
            return;
        }
        self.connected = true;
        logger.info("zk session established, id=%s", self.zk.client_id);
        // self._getAndWatchZKMayaChildren();
        self.emit('connected');
        // register to zk 1000ms later, waiting for db check and register to zk
        setTimeout(self._registerToMayaNodes.bind(self), 1000);
    });
}

ZKManager.prototype._registerToMayaNodes = function(){
    var self = this;
    self.zk.a_create(self.my_node_path, "", ZooKeeper.ZOO_EPHEMERAL,
        function (rc, error, path) {
            if (0 === rc) {
                logger.info("create zk node success, path=%s", self.my_node_path);
            } else if (ZooKeeper.ZNODEEXISTS === rc) {
                // node already exists, delete and recreate
                logger.warn("node %j already exists, delete and recreate", self.my_node_path);
                self.zk.a_delete_(self.my_node_path, null, function(rc, error) {
                    if (0 !== rc) {
                        logger.warn("delete zk node failed, rc: %d, error: '%s', path=%s",
                            rc, error, self.my_node_path);
                        self.zk.close();
                        return;
                    };
                    logger.trace("delete zk node success");
                    self._registerToMayaNodes();
                });
            } else {
                logger.warn("create zk node failed, rc: %d, error: '%s', path=%s",
                    rc, error, self.my_node_path);
                self.zk.close();
            }
        });
}

ZKManager.prototype.cleanup = function() {
    if (!this.zk) {
        return;
    };
    this.terminated = true;
    this.zk.removeAllListeners();
    this.removeAllListeners();
    this.connected && this.zk.close();
    this.connected = false;
}

//singleton
var zk_manager = new ZKManager();

exports.zk_manager = zk_manager;
