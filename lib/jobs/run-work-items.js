// Copyright 2015, EMC, Inc.

'use strict';

var di = require('di');

module.exports = runWorkItemsJobFactory;
di.annotate(runWorkItemsJobFactory, new di.Provide('Job.WorkItems.Run'));
di.annotate(runWorkItemsJobFactory, new di.Inject(
    'Job.Base',
    'Services.Waterline',
    'Logger',
    'Util',
    'uuid',
    'Promise',
    'Assert',
    '_',
    'Constants',
    'Services.Lookup'
));

function runWorkItemsJobFactory(
    BaseJob,
    waterline,
    Logger,
    util,
    uuid,
    Promise,
    assert,
    _,
    Constants,
    lookup
) {
    var logger = Logger.initialize(runWorkItemsJobFactory);

    function lookupHost (options) {
        if (options.ip && Constants.Regex.MacAddress.test(options.ip)) {
            return lookup.macAddressToIp(options.ip).then(function (ipAddress) {
                options.ip = ipAddress;
                return options;
            });
        }

        return options;
    }

    /**
     *
     * @param {Object} [options]
     * @constructor
     */
    function RunWorkItemsJob(options, context, taskId) {
        RunWorkItemsJob.super_.call(this, logger, options, context, taskId);

        this.routingKey = this.context.graphId;
        assert.uuid(this.routingKey) ;

        _.defaults(this.options, {
            queuePollInterval: 1 * 1000,
            defaultLeaseDuration: 15 * 1000,
        });

        this.workerId = uuid();

        this._workItemCallbacks = {
            'Pollers.IPMI': this._executeIpmiPoller.bind(this),
            'Pollers.SNMP': this._executeSnmpPoller.bind(this)
        };
    }

    util.inherits(RunWorkItemsJob, BaseJob);

    /**
     * @memberOf RunWorkItemsJob
     */

    RunWorkItemsJob.prototype._run = function _run() {
        var self = this;
        self._runWorkItems().catch(function (err) {
            if (self.isPending()) {
                self._done(err);
            }
        });
    };

    RunWorkItemsJob.prototype._runWorkItems = function _runWorkItems() {
        var self = this;
        return self._getWorkItem().then(function (workItem) {
            if (!workItem) {
                return Promise.delay(self.options.queuePollInterval);
            }
            return self._executeWorkItem(workItem)
            .catch(function (err) {
                self.logger.error("Work item failed.", {
                    error: err,
                    taskId: self.taskId,
                    workItemId: workItem.id
                });

                return waterline.workitems.setFailed(self.workerId, workItem);
            });
        }).then(function () {
            if (!self.isPending()) {
                return;
            }
            return self._runWorkItems();
        });
    };

    RunWorkItemsJob.prototype._getWorkItem = function _getWorkItem() {
        var self = this;

        if (!self.isPending()) {
            return Promise.resolve();
        }

        return waterline.workitems.startNextScheduled(
            self.workerId,
            {},
            self.options.defaultLeaseDuration
        );
    };

    RunWorkItemsJob.prototype._executeWorkItem = function _executeWorkItem(workItem) {
        var self = this;
        var func = self._workItemCallbacks[workItem.name];
        if (func) {
            logger.debug('Executing Work Item', {
                id: workItem.id,
                name: workItem.name
            });
            return func(workItem);
        }
        return Promise.reject('Unknown work item: ' + workItem.name);
    };

    RunWorkItemsJob.prototype._executeIpmiPoller = function _executeIpmiPoller(workItem) {
        var self = this;

        return Promise.resolve()
        .then(function() {
            assert.ok(workItem.config,'workItem.config');
            assert.string(workItem.config.command, 'workItem.config.command');
        })
        .then(function() {
            if (workItem.node) {
                return waterline.nodes.findOne(workItem.node);
            }
        })
        .then(function(node) {
            if (node) {
                var obmSetting = _.find(node.obmSettings, { service: 'ipmi-obm-service' });
                if (obmSetting) {
                    return obmSetting.config;
                }
            }
        })
        .then(function (obmSettings) {
            return Promise.resolve(
                _.assign(
                    {},
                    obmSettings, { node: workItem.node },
                    _.omit(workItem.config, 'command'),
                    { workItemId: workItem.id }
                )
            );
        })
        .then(lookupHost)
        .then(function (options) {
            return self._publishRunIpmiCommand(
                self.routingKey,
                workItem.config.command,
                options
            );
        });
    };

    RunWorkItemsJob.prototype._executeSnmpPoller = function _executeSnmpPoller(workItem) {
        assert.object(workItem.config, 'workItem.config');
        var self = this;

        return Promise.resolve()
        .then(function() {
            if (workItem.node) {
                return waterline.nodes.findOne(workItem.node);
            }
        })
        .then(function (node) {
            var options = _.assign(
                {},
                node ? node.snmpSettings : {},
                {
                    config: workItem.config,
                    workItemId: workItem.id,
                    pollInterval: workItem.pollInterval
                }
            );
            if (node) {
                options.node = node.id;
            }
            return options;
        })
        .then(function (options) {
            return self._publishRunSnmpCommand(
                self.routingKey,
                options
            );
        });
    };

    return RunWorkItemsJob;
}
