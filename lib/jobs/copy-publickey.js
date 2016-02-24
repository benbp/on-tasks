// Copyright 2016, EMC, Inc.

'use strict';

var di = require('di');
module.exports = copyKeyJobFactory;

di.annotate(copyKeyJobFactory, new di.Provide('Job.CopyKey'));
di.annotate(copyKeyJobFactory, new di.Inject(
    'Job.Base',
    'Util',
    'Logger',
    'Assert',
    'Promise',
    'Services.Waterline',
    'JobUtils.Remote'
));

function copyKeyJobFactory(
    BaseJob,
    util,
    Logger,
    assert,
    Promise,
    waterline,
    RemoteUtil
) {
    var logger = Logger.initialize(copyKeyJobFactory);

    function CopyKeyJob(options, context, taskId) {
        CopyKeyJob.super_.call(this, logger, options, context, taskId);
        assert.uuid(this.context.target);
        this.nodeId = this.context.target;
        this.retries = options.retries || 3;
        //todo confirm home directory
        this.commands = ['mkdir -p ~/.ssh/authorized_keys;'];
    }
    util.inherits(CopyKeyJob, BaseJob);

    CopyKeyJob.prototype._run = function run() {
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
                commandArgs: self.commands.concat(
                        'echo '+node.sshSettings.publicKey+' >> ~/.ssh/authorized_keys'
                ),
                retries: self.retries
            });
            return ssh.run();
        });
    };
    return CopyKeyJob;
}

