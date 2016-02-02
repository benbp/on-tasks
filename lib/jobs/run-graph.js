// Copyright 2015, EMC, Inc.

'use strict';

var di = require('di');

module.exports = runGraphJobFactory;
di.annotate(runGraphJobFactory, new di.Provide('Job.Graph.Run'));
    di.annotate(runGraphJobFactory,
    new di.Inject(
        'Job.Base',
        'Protocol.TaskGraphRunner',
        'Logger',
        'Assert',
        'uuid',
        'Util',
        'Promise',
        '_'
    )
);
function runGraphJobFactory(BaseJob, taskGraphProtocol, Logger, assert, uuid, util) {
    var logger = Logger.initialize(runGraphJobFactory);

    /**
     *
     * @param {Object} options
     * @param {Object} context
     * @param {String} taskId
     * @constructor
     */
    function RunGraphJob(options, context, taskId) {
        RunGraphJob.super_.call(this, logger, options, context, taskId);

        assert.string(this.options.graphName);
        assert.object(this.options.graphOptions);
        // context.target is optional depending on what graph is being run
        assert.object(context);

        if (!this.options.instanceId) {
            this.options.instanceId = uuid.v4();
        }
        this.graphId = this.options.instanceId;
        this.options.graphOptions.instanceId = this.graphId;
    }
    util.inherits(RunGraphJob, BaseJob);

    /**
     * @memberOf RunGraphJob
     */
    RunGraphJob.prototype._run = function() {
        var self = this;

        this._subscribeGraphFinished(function(status) {
            assert.string(status);
            if (status === 'succeeded') {
                self._done();
            } else {
                self._done(new Error("Graph " + self.graphId +
                        " failed with status " + status));
            }
        });

        taskGraphProtocol.runTaskGraph(
                self.options.graphName, self.options.graphOptions, self.options.graphOptions.target)
        .then(function(message) {
            try {
                // TODO: swap out with errors once we can do that over the bus protocol
                assert.uuid(message.instanceId);
            } catch (e) {
                // NOTE(heckj): I'm inclear if this should be an error (programmer fault)
                // or warning (fault of bad inputs) per conventions at
                // https://github.com/RackHD/docs/pull/222.
                logger.error("Error starting graph for task.", {
                    taskId: self.taskId,
                    graphName: self.options.graphName,
                    error: e
                });
                self._done(new Error("Unable to start graph for task " + self.taskId +
                                     " in graph " + self.options.graphName));
            }
        })
        .catch(function(error) {
            self._done(error);
        });
    };

    return RunGraphJob;
}
