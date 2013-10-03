var sinon = require('sinon');
var assert = require('assert');
var net = require('net');
var SqlParser = require('sqlparser').SqlParser;
var client_network = require('client_network.js');

describe('test session variables', function () {
    it('should set all variables', function(done) {
        var sql = "set @@Global.connect_timeout=10, \
            @@Local.net_read_timeout=30, @@Session.net_retry_count=10, \
            @@wait_timeout=30, \
            gLOBAL delayed_insert_limit=100, \
            sESSION sort_buffer_size=16777216, \
            Local net_write_timeout=60,\
            @u8=8, @u9='u9', cHARACTER sET utf8, \
            names 'utf8' COLLATE utf8_general_ci,\
            ";
        var sql_parser = new SqlParser();
        sql_parser.parse(sql);
        var tokens = sql_parser.getAllTokens();
        var cn = new client_network.ClientNetwork(new net.Socket());
        cn.setSessionVars(tokens);
        assert.equal(JSON.stringify(cn.session_settings),
            JSON.stringify({
                    'user' : {
                        'u8': '8',
                        'u9': '\'u9\'',
                    },
                    'global' : {
                        'connect_timeout': '10',
                        'delayed_insert_limit': '100',
                    },
                    'session' : {
                        'net_read_timeout': '30',
                        'net_retry_count': '10',
                        'wait_timeout': '30',
                        'sort_buffer_size': '16777216',
                        'net_write_timeout': '60',
                    },
                    'nonstandard' : {
                        'CHARACTER SET': 'utf8',
                        'NAMES': ' \'utf8\' COLLATE utf8_general_ci',
                    },
                    'client_flags' : 0,
                    'max_packet_size' : 0,
                    'charset_number' : 0,
                })
        );
        done();
    });
});
