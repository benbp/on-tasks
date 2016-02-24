// Copyright 2016, EMC, Inc.

'use strict';

var di = require('di');
module.exports = scpJobFactory;

di.annotate(scpJobFactory, new di.Provide('Job.Scp'));
di.annotate(scpJobFactory, new di.Inject(
    'Job.Base',
    'Util',
    'Logger',
    'Assert',
    'Promise',
    'ChildProcess',
    'Services.Waterline',
    'JobUtils.Remote'
));

function scpJobFactory(
    BaseJob,
    util,
    Logger,
    assert,
    Promise,
    ChildProcess,
    waterline,
    RemoteUtil
) {
    var logger = Logger.initialize(scpJobFactory);

    function ScpJob(options, context, taskId) {
        ScpJob.super_.call(this, logger, options, context, taskId);
        assert.string(options.fileSource);
        assert.string(options.fileDestination);

        assert.uuid(this.context.target);
        this.nodeId = this.context.target;
        this.fileSource = options.fileSource;
        this.fileDestination = options.fileDestination;
        this.retries = options.retries || 3;
    }
    util.inherits(ScpJob, BaseJob);

    ScpJob.prototype._run = function run() {
        var self = this;
        return Promise.resolve(this.context.target)
        .then(waterline.nodes.findByIdentifier)
        .then(function(node) {
            //add no-doc-found handling

            var scp = new RemoteUtil({
                command: 'scp',
                key: node.sshSettings.privateKey,
                userHost: node.sshSettings.user+'@'+node.sshSettings.host,
                password: node.sshSettings.password,
                fileSrc: self.fileSource,
                fileDest: self.fileDestination,
                retries: self.retries
            });
            return scp.run();
        });
    };
    return ScpJob;
}
