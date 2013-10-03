
var sinon = require('sinon');
var assert = require('assert');
var dns = require('dns');
var ZooKeeper = require("zookeeper");
var path = require('path');

var log4js = require('log4js');
log4js.setGlobalLogLevel("OFF");
global.logger = log4js.getLogger();

var zk_manager = require('zk_manager.js').zk_manager;

global.global_conf = {};
var zk_conf =
{
    "maya_zk_path" : "/sina_maya/maya_test",
    "connect": "xx127.0.0.1:2181",
    "timeout": 200000,
    "host_order_deterministic": false
}
global.global_conf.zk_conf = zk_conf;

var sandbox = sinon.sandbox.create();
sandbox.useFakeTimers();

describe('test init', function () {
    afterEach(function() {
        sandbox.restore();
    });

    it('should not init when no conf', function(done) {
        global.global_conf.zk_conf = undefined;
        zk_manager.init();
        global.global_conf.zk_conf = zk_conf;
        done();
    });
    it('should call _connect when dns resolve ok', function(done) {
        var stub_dns_resolve4 = sandbox.stub(dns, "resolve4", function(addr, callback){
            callback(null, ["1.2.3.4", "4.3.2.1"]);
        });
        var stub_connect = sandbox.stub(zk_manager, "_connect");
        zk_manager.init();
        assert.equal(global.global_conf.zk_conf.connect, "1.2.3.4:2181,4.3.2.1:2181,");
        assert(stub_connect.called);
        done();
    });
    it('should call _connect when dns resolve failed', function(done) {
        var stub_dns_resolve4 = sandbox.stub(dns, "resolve4", function(addr, callback){
            callback("failed");
        });
        var stub_connect = sandbox.stub(zk_manager, "_connect");
        zk_manager.init();
        assert.equal(global.global_conf.zk_conf.connect, zk_conf.connect);
        assert(stub_connect.called);
        done();
    });
    it('should callback close on zk event', function(done) {
        var stub_dns_resolve4 = sandbox.stub(dns, "resolve4", function(addr, callback){
            callback("failed");
        });
        var stub_connect = sandbox.stub(zk_manager, "_connect");
        zk_manager.init();
        zk_manager.connected = true;
        zk_manager.zk.emit('close');
        assert.ifError(zk_manager.connected);

        zk_manager.terminated = true;
        zk_manager.connected = true;
        zk_manager.zk.emit('close');
        assert(zk_manager.connected);

        zk_manager.terminated = false;
        done();
    });
    it('should callback connecting on zk event', function(done) {
        var stub_dns_resolve4 = sandbox.stub(dns, "resolve4", function(addr, callback){
            callback("failed");
        });
        var stub_connect = sandbox.stub(zk_manager, "_connect");
        zk_manager.init();
        zk_manager.connected = true;
        zk_manager.zk.emit('connecting');
        assert.ifError(zk_manager.connected);

        done();
    });
    it('should callback connect on zk event', function(done) {
        var stub_dns_resolve4 = sandbox.stub(dns, "resolve4", function(addr, callback){
            callback("failed");
        });
        var stub_connect = sandbox.stub(zk_manager, "_connect");
        zk_manager.init();
        zk_manager.connected = false;
        zk_manager.zk.emit('connect');
        assert(zk_manager.connected);

        done();
    });
});

describe('test _connect', function () {
    afterEach(function() {
        sandbox.restore();
    });
    it('should call _registerToMayaNodes when zk connect ok', function(done) {
        var stub_zk_connect = sandbox.stub(zk_manager.zk, "connect", function(callback){
            callback();
        });
        var stub_registerToMayaNodes = sandbox.stub(zk_manager, "_registerToMayaNodes");
        sandbox.useFakeTimers();
        zk_manager._connect();
        sandbox.clock.tick(1001);
        assert(stub_registerToMayaNodes.called);
        done();
    });
    it('should retry init when zk connect fail', function(done) {
        var stub_zk_connect = sandbox.stub(zk_manager.zk, "connect", function(callback){
            callback("test error");
        });
        var stub_init = sandbox.stub(zk_manager, "init");
        sandbox.useFakeTimers();
        zk_manager._connect();
        sandbox.clock.tick(5001);
        assert(stub_init.called);
        done();
    });
});

describe('test _registerToMayaNodes', function () {
    afterEach(function() {
        sandbox.restore();
    });
    it('should do nothing if create success', function(done) {
        var stub_zk_a_create = sandbox.stub(zk_manager.zk, "a_create",
            function (path, data, nodetype, callback) {
            callback(0, "", path);
            });
        zk_manager._registerToMayaNodes();
        done();
    });
    it('should delete node and retry if ZNODEEXISTS', function(done) {
        var returns_create = [
            [ZooKeeper.ZNODEEXISTS, "test create fail", "test path"],
            [0, "", "test path"]];
        var stub_zk_a_create = sandbox.stub(zk_manager.zk, "a_create",
            function (path, data, nodetype, callback) {
            callback.apply(this, returns_create.shift());
            });
        var stub_zk_a_delete_ = sandbox.stub(zk_manager.zk, "a_delete_",
            function (path, x, callback) {
            callback(0, "");
            });
        zk_manager._registerToMayaNodes();
        assert(stub_zk_a_create.calledTwice);
        assert(stub_zk_a_delete_.calledOnce);
        done();
    });
    it('should close zk if delete node fail', function(done) {
        var stub_zk_a_create = sandbox.stub(zk_manager.zk, "a_create",
            function (path, data, nodetype, callback) {
            callback(ZooKeeper.ZNODEEXISTS, "test create fail", "test path");
            });
        var stub_zk_a_delete_ = sandbox.stub(zk_manager.zk, "a_delete_",
            function (path, x, callback) {
            callback(1, "test delete error");
            });
        var stub_zk_close = sandbox.stub(zk_manager.zk, "close");
        zk_manager._registerToMayaNodes();
        assert(stub_zk_a_delete_.calledOnce);
        assert(stub_zk_close.calledOnce);
        done();
    });
    it('should close zk if create fail but not ZNODEEXISTS', function(done) {
        var stub_zk_a_create = sandbox.stub(zk_manager.zk, "a_create",
            function (path, data, nodetype, callback) {
            callback(ZooKeeper.ZNODEEXISTS+1, "test create fail", "test path");
            });
        var stub_zk_a_delete_ = sandbox.stub(zk_manager.zk, "a_delete_",
            function (path, x, callback) {
            callback(1, "test delete error");
            });
        var stub_zk_close = sandbox.stub(zk_manager.zk, "close");
        zk_manager._registerToMayaNodes();
        assert.ifError(stub_zk_a_delete_.called);
        assert(stub_zk_close.calledOnce);
        done();
    });
});

describe('test cleanup', function () {
    afterEach(function() {
        sandbox.restore();
    });
    it('should terminated after cleanup', function(done) {
        zk_manager.init();
        zk_manager.cleanup();
        assert(zk_manager.terminated)
        zk_manager.terminated = false;
        zk_manager.zk = null;
        zk_manager.cleanup();
        assert.ifError(zk_manager.terminated)
        done();
    });
});
