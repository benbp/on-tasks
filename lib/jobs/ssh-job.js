// Copyright 2016, EMC, Inc.

'use strict';

var di = require('di');
module.exports = sshJobFactory;

di.annotate(sshJobFactory, new di.Provide('Job.Ssh'));
di.annotate(sshJobFactory, new di.Inject(
    'Job.Base',
    'JobUtils.CommandParser',
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
    parser,
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
        assert.string(this.context.target);
        this.nodeId = this.context.target;
        this.commands = this.buildCommands(options.commands);
        assert.arrayOfObject(this.commands);
    }
    util.inherits(SshJob, BaseJob);

    SshJob.prototype._run = function run() {
        var self = this;

        return waterline.nodes.needByIdentifier(self.nodeId)
        .then(function(node) {
            return Promise.reduce(self.commands, function(results, commandData) {
                var ssh = new RemoteUtil({
                    command: 'ssh',
                    key: node.sshSettings.privateKey,
                    userHost: node.sshSettings.user+'@'+node.sshSettings.host,
                    password: node.sshSettings.password,
                    commandArgs: [commandData.command],
                    retries: commandData.retries || 0
                });

                return ssh.run()
                .then(function(result) {
                    result.catalogOptions = commandData.catalogOptions;
                    return results.concat([result]);
                });
            }, []);
        })
        .then(self.handleResponse.bind(self))
        .then(function() {
            self._done();
        })
        .catch(self._done.bind(self));
    };

    SshJob.prototype.handleResponse = function(results) {
        var self = this;

        logger.debug("Received command payload from node.", {
            id: self.nodeId
        });

        var catalogTasks = _.filter(results, function(result) {
            return _.has(result, 'catalogOptions');
        });

        return self.catalogUserTasks(catalogTasks)
        .catch(function(err) {
            logger.error("Job error processing catalog output.", {
                error: err,
                id: self.nodeId,
                taskContext: self.context
            });
            throw err;
        });
    };

    SshJob.prototype.catalogUserTasks = function(tasks) {
        var self = this;

        _.forEach(tasks, function(task) {
            debugger;
        });

        return parser.parseUnknownTasks(tasks)
        .spread(function() {
            return Promise.map(Array.prototype.slice.call(arguments), function(result) {
                if (result.error) {
                    logger.error("Failed to parse data for " +
                        result.source + ', ' + result.error,
                        { error: result });
                } else if (result.store) {
                    return waterline.catalogs.create({
                        node: self.nodeId,
                        source: result.source || 'unknown',
                        data: result.data
                    });
                } else {
                    logger.info("Catalog result for " + result.source +
                        " has not been marked as significant. Not storing.");
                }
            });
        });
    };

    /**
     * Transforms the command option json from a task definition to a json schema
     * consumed by the RemoteUtil ssh utility
     *
     * @example
     * Sample input:
     *  [
     *      {
     *          command: 'sudo lshw -json',
     *          catalog: { format: 'json', source: 'lshw user' }
     *      }
     *  ]
     *
     * Sample output:
     *  [
     *      {
     *          cmd: 'sudo lshw -json',
     *          source: 'lshw user',
     *          format: 'json',
     *          catalog: true
     *      }
     *  ]
     *
     * @memberOf SshJob
     * @function
     */
    SshJob.prototype.buildCommands = function(commands) {
        return _.map(_.toArray(commands), function(cmd) {
            if (typeof cmd === 'string') {
                return { command: cmd };
            }
            return _.transform(cmd, function(cmdObj, v, k) {
                if (k === 'catalog') {
                    cmdObj.catalogOptions = {
                        source: v.source,
                        format: v.format
                    };
                } else if (k === 'command') {
                    cmdObj.command = v;
                } else if (k === 'retries') {
                    cmdObj.retries = v;
                } else if (k === 'downloadUrl') {
                    throw new Error('downloadUrl option is not supported yet');
                } else if (k === 'acceptedResponseCodes') {
                    throw new Error('acceptedResponseCodes option is not supported yet');
                }
            }, {});
        });
    };

    return SshJob;
}

