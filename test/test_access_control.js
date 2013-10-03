var assert = require('assert');
var AccessControl = require('../src/access_control').AccessControl;
var allowed_ip = require("../conf/maya.json").allowed_ip;
var denied_ip = require("../conf/maya.json").denied_ip;

var ac = new AccessControl();

/*
assert.equal(true, ac.is_allowed("127.0.0.1"));
assert.equal(true, ac.is_allowed("10.210.209.1"));


assert.equal(false, ac.is_allowed("10.0.1.1"));
assert.equal(true, ac.is_allowed("10.0.1.12"));

assert.equal(false, ac.is_allowed("10.210.209.28"));
assert.equal(false, ac.is_allowed("10.210.209.3"));
assert.equal(false, ac.is_allowed("192.168.1.1"));
*/

describe('test Percent', function () {
    allowed_ip = [
    "%.1"
    ];

    denied_ip = [
    "10.%.1.7%"
    ];
    ac.init(allowed_ip, denied_ip);
    it('should return true when the ip matches with the expression array', function() {
        assert.equal(true, ac.is_allowed("127.0.0.1"));
    });
    it('should return false when the ip does not match with the expression array', function() {
        assert.equal(false, ac.is_allowed("127.0.0.11"));
        assert.equal(false, ac.is_allowed("10.210.1.2"));
        assert.equal(false, ac.is_allowed("10.210.1.7"));
    });
});
