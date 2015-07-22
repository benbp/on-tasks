'use strict';

module.exports = snmpNodeUpdateJobFactory;

snmpNodeUpdateJobFactory.$provide = 'Job.Snmp.Node.Update';
snmpNodeUpdateJobFactory.$inject = [
    'Job.Base',
    'Util',
    'Services.Waterline',
    'Logger'
];

function snmpNodeUpdateJobFactory(BaseJob, util, waterline, Logger) {
    var logger = Logger.initialize(snmpNodeUpdateJobFactory);

    function SnmpNodeUpdateJob(options, context, taskId) {
        SnmpNodeUpdateJob.super_.call(this, logger, options, context, taskId);
        this.nodeId = this.context.target;
    }
    util.inherits(SnmpNodeUpdateJob, BaseJob);

    SnmpNodeUpdateJob.prototype._run = function _run() {
        var self = this;

        return waterline.nodes.findByIdentifier(self.nodeId)
        .then(function(node) {
            return [node, waterline.catalogs.findOne({ node : node.id })];
        })
        .spread(function (node, catalog) {

            return waterline.nodes.updateByIdentifier(node.id, {
                name: catalog.data['SNMPv2-MIB::sysDescr-0'] +
                    '_' + node.snmpSettings.host
            });
        })
        .then(function() {
            self._done();
        })
        .catch(function(err){
            self._done(err);
        });
    };
    return SnmpNodeUpdateJob;
}
