
var assert = require('assert');
var virtual_table = require('virtual_table.js');
var sprintf = require('sprintf').sprintf;

var log4js = require('log4js');
log4js.setGlobalLogLevel("OFF");
global.logger = log4js.getLogger();

var conf_only_by_table =
{
    "virtual_table_name": "my_table",
    "rowkey": "id",
    "db_partition_num": 1,
    "table_partition_num": 64,
    "assign_db_instance_by": "table",
    "partition_table_name_pattern": "my_table_%02x",
    "hash_func": "parseInt(hash('crc32', value), 16);",
    "partitions": [
        {
            "db_group": "group_0",
            "assign_range": "[0x00..0x1f]"
        },
        {
            "db_group": "group_1",
            "assign_range": "[32..63]"
        }
    ]
}

var conf_by_db_table_assign_by_db =
{
    "virtual_table_name": "my_table",
    "rowkey": "id",
    "db_partition_num": 8,
    "table_partition_num": 32,
    "assign_db_instance_by": "db",
    "partition_db_name_pattern": "db_%02d",
    "partition_table_name_pattern": "my_table_%02x",
    "hash_func": "parseInt(hash('crc32', value), 16);",
    "partitions": [
        {
            "db_group": "group_0",
            "assign_range": "[0..3]"
        },
        {
            "db_group": "group_1",
            "assign_range": "[4..7]"
        }
    ]
}

var conf_table_regexp =
{
    "virtual_table_name": "^table_",
    "rowkey": "id",
    "db_partition_num": 8,
    "assign_db_instance_by": "db",
    "partition_db_name_pattern": "db_%02d",
    "hash_func": "parseInt(hash('crc32', value), 16);",
    "partitions": [
        {
            "db_group": "group_0",
            "assign_range": "[0..3]"
        },
        {
            "db_group": "group_1",
            "assign_range": "[4..7]"
        }
    ]
}

var conf_by_db_table_assign_by_db_with_offset =
{
    "virtual_table_name": "my_table",
    "rowkey": "id",
    "db_partition_num": 8,
    "table_partition_num": 32,
    "table_index_begin": 1,
    "db_index_begin": 1,
    "assign_db_instance_by": "db",
    "partition_db_name_pattern": "db_%02d",
    "partition_table_name_pattern": "my_table_%02x",
    "hash_func": "parseInt(hash('crc32', value), 16);",
    "partitions": [
        {
            "db_group": "group_0",
            "assign_range": "[1..4]"
        },
        {
            "db_group": "group_1",
            "assign_range": "[5..8]"
        }
    ]
}

var conf_by_db_assign_by_db =
{
    "virtual_table_name": "my_table",
    "rowkey": "id",
    "db_partition_num": 8,
    "table_partition_num": 1,
    "assign_db_instance_by": "db",
    "partition_db_name_pattern": "db_%02d",
    "hash_func": "parseInt(hash('crc32', value), 16);",
    "partitions": [
        {
            "db_group": "group_0",
            "assign_range": "[0..3]"
        },
        {
            "db_group": "group_1",
            "assign_range": "[4..7]"
        }
    ]
}

describe('test Only By Table', function () {
    var vt = new virtual_table.VirtualTable();
    var conf = conf_only_by_table;
    vt.init(conf);

    it('should run OK', function(done) {
        process.nextTick(function() {
            var slices = {};
            vt.getAllSlicesMap(slices);
            assert.equal(slices["my_table_25"], "group_1");

            assert.equal(vt.rowkey, conf.rowkey);
            var info = {};

            info = vt.getKeyValueInfo(0);
            //console.log(info);
            assert.notEqual(undefined, info);
            assert.equal(info.partition_db_name, "");
            assert.equal(info.partition_table_name, "my_table_25");
            assert.equal(info.db_group, "group_1");

            info = vt.getKeyValueInfo("str");
            //console.log(info);
            assert.notEqual(undefined, info);
            assert.equal(info.partition_db_name, "");
            assert.equal(info.partition_table_name, "my_table_07");
            assert.equal(info.db_group, "group_0");
            done();
        });
    });
});

describe('test By DB and Table, Assign By db',  function () {
    var vt = new virtual_table.VirtualTable();
    var conf = conf_by_db_table_assign_by_db;
    vt.init(conf);

    it('should run OK', function(done) {
        process.nextTick(function() {
            var slices = {};
            vt.getAllSlicesMap(slices);
            assert.equal(slices["db_05"], "group_1");

            assert.equal(vt.rowkey, conf.rowkey);
            var info = {};

            info = vt.getKeyValueInfo(0);
            //console.log(info);
            assert.notEqual(undefined, info);
            assert.equal(info.partition_db_name, "db_05");
            assert.equal(info.partition_table_name, "my_table_05");
            assert.equal(info.db_group, "group_1");

            info = vt.getKeyValueInfo("str_test");
            //console.log(info);
            assert.notEqual(undefined, info);
            assert.equal(info.partition_db_name, "db_01");
            assert.equal(info.partition_table_name, "my_table_19");
            assert.equal(info.db_group, "group_0");
            done();
        });
    });
});

describe('test By DB, Assign By db',  function () {
    var vt = new virtual_table.VirtualTable();
    var conf = conf_by_db_assign_by_db;
    vt.init(conf);

    it('should run OK', function(done) {
        process.nextTick(function() {
            assert.equal(vt.rowkey, conf.rowkey);
            var info = {};

            info = vt.getKeyValueInfo(0);
            //console.log(info);
            assert.notEqual(undefined, info);
            assert.equal(info.partition_db_name, "db_05");
            assert.equal(info.partition_table_name, "");
            assert.equal(info.db_group, "group_1");

            info = vt.getKeyValueInfo("str_test");
            //console.log(info);
            assert.notEqual(undefined, info);
            assert.equal(info.partition_db_name, "db_01");
            assert.equal(info.partition_table_name, "");
            assert.equal(info.db_group, "group_0");
            done();
        });
    });
});

describe('test table name regexp', function() {
    var vt = new virtual_table.VirtualTable();
    var conf = conf_table_regexp;
    vt.init(conf);

    it('should run OK', function(done) {
        process.nextTick(function() {
            assert.equal(vt.rowkey, conf.rowkey);
            var info = {};

            info = vt.getKeyValueInfo(10);
            //console.log(info);
            assert.notEqual(undefined, info);
            assert.equal(info.partition_db_name, "db_01");
            assert.equal(info.partition_table_name, "");
            assert.equal(info.db_group, "group_0");

            info = vt.getKeyValueInfo("str_test");
            //console.log(info);
            assert.notEqual(undefined, info);
            assert.equal(info.partition_db_name, "db_01");
            assert.equal(info.partition_table_name, "");
            assert.equal(info.db_group, "group_0");
            done();
        });
    });
});

describe('test Hash', function() {
    var vt = new virtual_table.VirtualTable();
    var conf = conf_by_db_table_assign_by_db;

    it('should run OK', function(done) {
        process.nextTick(function() {
            for(var i = 0; i< 100; i++) {
                conf.hash_func = i;
                vt.init(conf);

                assert.equal(vt.rowkey, conf.rowkey);
                var info = vt.getKeyValueInfo(0);
                assert.equal(info.partition_db_name, sprintf("db_%02d", i%conf.db_partition_num));
                assert.equal(info.partition_table_name, sprintf("my_table_%02x", i%conf.table_partition_num));
            }
            done();
        });
    });
});

describe('test Hash with offset', function() {
    var vt = new virtual_table.VirtualTable();
    var conf = conf_by_db_table_assign_by_db_with_offset;

    it('should run OK', function(done) {
        process.nextTick(function() {
            for(var i = 0; i< 100; i++) {
                conf.hash_func = i;
                vt.init(conf);

                assert.equal(vt.rowkey, conf.rowkey);
                var info = vt.getKeyValueInfo(0);
                assert.equal(info.partition_db_name, sprintf("db_%02d", i%conf.db_partition_num+1));
                assert.equal(info.partition_table_name, sprintf("my_table_%02x", i%conf.table_partition_num+1));
            }
            done();
        });
    });
});
