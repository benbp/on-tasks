// Copyright 2016, EMC, Inc.

'use strict';

var di = require('di');
module.exports = sshJobFactory;

di.annotate(sshJobFactory, new di.Provide('Job.Ssh'));
di.annotate(sshJobFactory, new di.Inject(
    'Job.Base',
    'Util',
    'Logger',
    'Assert',
    'Promise',
    'ChildProcess',
    'Services.Waterline',
    'JobUtils.Remote',
    '_'
));

function sshJobFactory(
    BaseJob,
    util,
    Logger,
    assert,
    Promise,
    ChildProcess,
    waterline,
    RemoteUtil,
    _
) {
    var logger = Logger.initialize(sshJobFactory);

    function SshJob(options, context, taskId) {
        SshJob.super_.call(this, logger, options, context, taskId);
        assert.arrayOfString(options.commands);
        assert.uuid(this.context.target);
        this.nodeId = this.context.target;
        this.retries = options.retries || 3;
        this.commands = _.map(options.commands, function(cmd) {
            return _.endsWith(cmd, ';') ? cmd: cmd.concat(';');
        });
    }
    util.inherits(SshJob, BaseJob);

    SshJob.prototype._run = function run() {
        var self = this;
        return Promise.resolve(this.context.target)
        .then(waterline.nodes.findByIdentifier)
        .then(function(node) {
            //add no-doc-found handling

            var ssh = new RemoteUtil({
                command: 'ssh',
                key: node.sshSettings.privateKey,
                userHost: node.sshSettings.user+'@'+node.sshSettings.host,
                password: node.sshSettings.password,
                commandArgs: self.commands,
                retries: self.retries
            });
            return ssh.run();
        });
    };
    return SshJob;
}

