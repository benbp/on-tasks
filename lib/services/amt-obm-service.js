// Copyright 2015, EMC, Inc.

'use strict';

var di = require('di'),
    util = require('util');

module.exports = amtObmServiceFactory;

di.annotate(amtObmServiceFactory, new di.Provide('amt-obm-service'));
di.annotate(amtObmServiceFactory,
    new di.Inject('Promise', 'OBM.base', '_')
);

function amtObmServiceFactory(Promise, BaseObmService, _) {
    function AmtObmService(options) {
        BaseObmService.call(this, options);
        this.requiredKeys = ['host', 'password'];
    }
    util.inherits(AmtObmService, BaseObmService);

    AmtObmService.prototype.reboot = function() {
        return this._runInternal(['--force', this.options.config.host,
                'rem_control', 'reset', 'pxe']);
    };

    AmtObmService.prototype.powerOn = function() {
        return this._runInternal(['--force', this.options.config.host,
                'rem_control', 'powerup', 'pxe']);
    };

    AmtObmService.prototype.powerOff = function() {
        return this._runInternal(['--force', this.options.config.host, 'rem_control', 'powerdown']);
    };

    AmtObmService.prototype.powerStatus = function() {
        return this._runInternal(
            ['--force', this.options.config.host, 'rem_control', 'info'], 1
        ).then(function (result) {
            // AMT Power On
            if (_.contains(result.stdout, 'S0')) {
                return true;
            }

            // AMT Power Off
            if (_.contains(result.stdout, 'S5 (soft-off)')) {
                return false;
            }

            return Promise.reject(
                new Error('Unable to determine power state (' + result.stdout + ').')
            );
        });
    };

    AmtObmService.prototype.setBootPxe = function() {
        return this._runInternal(['--force', this.options.config.host,
                'rem_control', 'setbootopt', 'pxe']);
    };

    AmtObmService.prototype._runInternal = function (subcommand, code) {
        return this.run({
            command: 'amttool-tng',
            args: subcommand,
            env: {
                AMT_PASSWORD: this.options.config.password,
                AMT_TIMEOUT: 3
            },
            code: code,
            retries: this.options.retries,
            delay: this.options.delay
        });
    };

    AmtObmService.create = function(options) {
        return BaseObmService.create(AmtObmService, options);
    };

    return AmtObmService;
}
