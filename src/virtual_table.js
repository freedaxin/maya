/**
 * @fileoverview virtual table
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2011.12.29
 */

"use strict";

var sprintf = require('sprintf').sprintf;
var hash = require('mhash').hash;

function VirtualTable() {
    this.virtual_table_name = "";
    this.rowkey = "";
    this.db_partition_num = 1;
    this.table_partition_num = 1;
    this.assign_db_instance_by = "table";
    this.partition_db_name_pattern = "";
    this.partition_table_name_pattern = "";
    this.map_partition_table_group = [];
    this.map_partition_db_table_name = {};
    this.is_table_divided = true;
    this.reg_table_name = "";
    this.table_index_begin = 0;
    this.db_index_begin = 0;
}

VirtualTable.prototype.init = function (conf) {
    this.virtual_table_name = conf.virtual_table_name;
    this.rowkey = conf.rowkey;
    try {
        eval("this.hashCode = function(value) { return " + conf.hash_func + "; }");
    } catch (e) {
        logger.warn('invalid hash func: %s', conf.hash_func);
    }
    (conf.db_partition_num >= 1) && (this.db_partition_num = conf.db_partition_num);
    (conf.table_partition_num >= 1) && (this.table_partition_num = conf.table_partition_num);
    this.partition_db_name_pattern = conf.partition_db_name_pattern || "";
    this.partition_table_name_pattern = conf.partition_table_name_pattern || "";
    this.assign_db_instance_by = conf.assign_db_instance_by;
    this.table_index_begin = conf.table_index_begin || 0;
    this.db_index_begin = conf.db_index_begin || 0;

    if (conf.partition_table_name_pattern === "" ||
        conf.table_partition_num <= 1) {
        // 不分表
        this.is_table_divided = false;
        this.reg_table_name = new RegExp(conf.virtual_table_name);
    }

    try {
        this.db_partition_num > 1 && sprintf(this.partition_db_name_pattern, 1);
        this.table_partition_num > 1 && sprintf(this.partition_table_name_pattern, 1);
    } catch (e) {
        var err =
            new Error("invalid [partition_db_name_pattern: %s] or [partition_table_name_pattern: %s], err: %s",
            this.partition_db_name_pattern, this.partition_table_name_pattern, e.toString());
        throw err;
    }
    conf.partitions.forEach(this._createTableMap.bind(this));
    //logger.trace("map_partition_table_group: \n", this.map_partition_table_group[0]);
}

VirtualTable.prototype.getKeyValueInfo = function (keyvalue) {
    // generate int hash value for key
    var key_hashcode = this.hashCode(keyvalue);
    var db_index = this.db_index_begin + (key_hashcode % this.db_partition_num);
    var table_index = this.table_index_begin + (key_hashcode % this.table_partition_num);
    return this.map_partition_table_group[db_index][table_index];
}

VirtualTable.prototype.getAllSlicesMap = function (slices) {
    for (var i in this.map_partition_table_group) {
        for (var j in this.map_partition_table_group[i]) {
            var slice = this.map_partition_table_group[i][j];
            if ("db" === this.assign_db_instance_by) {
                slices[slice.partition_db_name] = slice.db_group;
            } else {
                slices[slice.partition_table_name] = slice.db_group;
            }
        };
    }
}

VirtualTable.prototype._createTableMap = function (partitions_group) {
    var r = partitions_group.assign_range.split("..");
    var begin = parseInt(r[0].replace('[', ''));
    var end = parseInt(r[1].replace(']', ''));

    for(var i=begin; i <= end; i++) {
        if ("db" === this.assign_db_instance_by) {
            for(var j=this.table_index_begin; j<this.table_partition_num+this.table_index_begin;j++) {
                !this.map_partition_table_group[i] && (this.map_partition_table_group[i] = []);
                this.map_partition_table_group[i][j] = {};
                this.map_partition_table_group[i][j].db_group = partitions_group.db_group;
                this.map_partition_table_group[i][j].partition_db_name = sprintf(this.partition_db_name_pattern, i);
                this.map_partition_table_group[i][j].partition_table_name = sprintf(this.partition_table_name_pattern, j);

            }
        } else {
            for(var j=this.db_index_begin; j<this.db_partition_num+this.db_index_begin;j++) {
                !this.map_partition_table_group[j] && (this.map_partition_table_group[j] = []);
                this.map_partition_table_group[j][i] = {};
                this.map_partition_table_group[j][i].db_group = partitions_group.db_group;
                this.map_partition_table_group[j][i].partition_db_name = sprintf(this.partition_db_name_pattern, j);
                this.map_partition_table_group[j][i].partition_table_name = sprintf(this.partition_table_name_pattern, i);
            }
        };
    }
}

exports.VirtualTable = VirtualTable;
