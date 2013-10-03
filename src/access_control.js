
"use strict";
var util = require('util');

function AccessControl() {
    this.ip_allowed = [];
    this.ip_denied = [];
    this.reg_allowed = null;
    this.reg_denied = null;
}

AccessControl.prototype.init = function(ip_allowed, ip_denied) {
    this.ip_allowed = ip_allowed || [];
    this.ip_denied = ip_denied || [];
    this.reg_allowed = this.render_reg(this.ip_allowed);
    if(this.ip_denied.length) {
        this.reg_denied = this.render_reg(this.ip_denied);
    } else {
        this.reg_denied = new RegExp("a.b.c.d");
    }
}

AccessControl.prototype.render_reg = function(ips) {
    var regs = [];
    for (var i in ips) {
        var ip = ips[i].replace(/\./g, "\\.");
        regs.push(util.format("^%s$", ip.replace(/%/g, ".*")));
    }
    var reg = new RegExp(regs.join("|"));
    //console.log(reg);
    return reg;
}

/* entry point of ip access control module. */
AccessControl.prototype.is_allowed = function(ip) {
    return !this.reg_denied.test(ip) && this.reg_allowed.test(ip);
}

exports.AccessControl = AccessControl;
