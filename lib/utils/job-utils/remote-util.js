// Copyright 2016, EMC, Inc.

'use strict';

var di = require('di');
module.exports = remoteUtilFactory;

di.annotate(remoteUtilFactory, new di.Provide('JobUtils.Remote'));
di.annotate(remoteUtilFactory, new di.Inject(
    'Util',
    'Logger',
    'Assert',
    'Promise',
    'ChildProcess',
    'Services.Waterline',
    'fs',
    'Rx',
    'Services.Encryption',
    'Encryption',
    '_'
));

function remoteUtilFactory(
    util,
    Logger,
    assert,
    Promise,
    ChildProcess,
    waterline,
    nodeFs,
    rx,
    cryptService,
    Encryption,
    _
) {

    var logger = Logger.initialize(remoteUtilFactory);
    var fs = Promise.promisifyAll(nodeFs);
    var encryption = new Encryption();

    function RemoteUtil(remoteOptions) {
        assert.string(remoteOptions.userHost);
        assert.string(remoteOptions.password);
        assert.string(remoteOptions.command);

        this.remoteOptions = remoteOptions;
        this.childOptions = {
            retries : remoteOptions.retries
        };

        var fileDest = remoteOptions.fileDest ? ':'+remoteOptions.fileDest : null;
        var keyArg;
        if(remoteOptions.key) {
            this.key = cryptService.decrypt(remoteOptions.key);
            this.keyFile = '/tmp/key' + encryption.iv().replace('/','');
            keyArg = '-i '+this.keyFile;
        }
        var remoteCommands;
        if(remoteOptions.commandArgs) {
            remoteOptions.commandArgs.unshift('set -e;');
            remoteCommands = '"'+remoteOptions.commandArgs.join(' ')+'"';
        }
        this.commandArgs = [
            '-c',
            _.compact([
                'spawn',' ',
                remoteOptions.command,' ',
                keyArg,' ',
                remoteOptions.fileSrc,' ',
                remoteOptions.userHost,
                fileDest,' ',
                remoteCommands,'; ',
                'expect  "*ass" {send "',
                cryptService.decrypt(remoteOptions.password),
                '\r";expect eof {catch wait res; exit [lindex $res 3]}}',
                ' eof {catch wait res; exit [lindex $res 3]}'
            ]).join('')
        ];
    }

    RemoteUtil.prototype.run = function run() {
        var self = this;
        var keyPromise;

        if (this.key) {
            keyPromise = this.keyGet(this.key, this.keyFile);
        } else {
            keyPromise = Promise.resolve();
        }

        return keyPromise
        .then(function() {
            return new ChildProcess(
                '/usr/bin/expect',
                self.commandArgs,
                undefined,
                undefined,
                self.maxBuffer
            ).run(self.childOptions);
        })
        .tap(function() {
            if (self.keyFile) {
                return fs.unlinkAsync(self.keyFile);
            }
        })
        .catch(function(e) {
            logger.error(
                "Error executing remote job", {
                    commands: self.commandArgs,
                    error:e
                }
            );
            throw e;
        });
    };

    RemoteUtil.prototype.keyGet = function keyGet(keySrc, keyFile) {
        //todo remove readfileasync
        return fs.readFileAsync(keySrc)
        .then(function(key) {
            return fs.writeFileAsync(keyFile, cryptService.decrypt(key.toString()));
        })
        .then(function() {
            return fs.chmodAsync(keyFile, '0600');
        })
        .catch(function(e) {
            console.log(e);
        });
    };
    return RemoteUtil;
}
