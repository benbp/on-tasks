// Copyright 2015, EMC, Inc.
/* jshint node:true */
'use strict';

var di = require('di');

module.exports = generateEnclosureJobFactory;
di.annotate(generateEnclosureJobFactory, new di.Provide('Job.Catalog.GenerateEnclosure'));
di.annotate(generateEnclosureJobFactory, new di.Inject(
    'Job.Base',
    'Services.Waterline',
    'JobUtils.CatalogSearchHelpers',
    'Logger',
    'Util',
    'Promise',
    'Assert',
    '_'
));

function generateEnclosureJobFactory(
    BaseJob,
    waterline,
    catalogSearch,
    Logger,
    util,
    Promise,
    assert,
    _
) {

    var logger = Logger.initialize(generateEnclosureJobFactory);

    /**
     *
     * @param {Object} [options]
     * @constructor
     */
    function GenerateEnclosureJob(options, context, taskId) {
        GenerateEnclosureJob.super_.call(this, logger, options, context, taskId);

        this.nodeId = context.target || options.nodeId;
        assert.isMongoId(this.nodeId);
    }

    util.inherits(GenerateEnclosureJob, BaseJob);

    var TYPE_ENCL = 'enclosure';
    var RELATION_ENCL = 'encloses';
    var RELATION_ENCL_BY = 'enclosedBy';
    var ENCL_SN_PATH = [
        {
            src: 'ipmi-fru',
            entry: 'Builtin FRU Device (ID 0).Product Serial'
        },
        {
            src: 'dmi',
            entry: 'System Information.Serial Number'
        }];

    /**
     * @memberOf GenerateEnclosureJob
     * @returns {Promise}
     */
    GenerateEnclosureJob.prototype._run = function run() {
        var self = this;
        var enclNode;

        Promise.all([
            Promise.any([
                self._findSerialNumber(ENCL_SN_PATH[0]),
                self._findSerialNumber(ENCL_SN_PATH[1])
            ]),
            waterline.nodes.find({ type: TYPE_ENCL })
        ])
        .spread(_matchEnclosure)
        .then(function (matchInfo) {
            // Create an enclosure node if there isn't matched one
            enclNode = matchInfo.encl;

            if (_.isEmpty(enclNode)) {

                var enclData = {
                    name: 'Enclosure Node ' + matchInfo.sn,
                    type: TYPE_ENCL,
                    relations: [{
                        relationType: RELATION_ENCL,
                        targets: []
                    }]
                };

                return waterline.nodes.create(enclData)
                .then(function(node) {
                    enclNode = node;
                    logger.debug('No matched enclosure, create a new one', {
                        id: self.nodeId,
                        enclosure: enclNode.id
                    });
                });
            }
            else {
                logger.debug(enclNode.name + ' matched', {
                    id: self.nodeId,
                    enclosure: enclNode.id
                });
            }
        })
        .then(function () {
            // Add compute node info into enclosure node

            var relation = _.find(enclNode.relations, { relationType: RELATION_ENCL });
            var enclosedNodes = relation.targets;
            if (enclosedNodes.indexOf(self.nodeId) === -1) {
                // If current compute node id isn't in enclosure node, update the latter

                enclosedNodes.push(self.nodeId);

                var updateData = {
                    relations: [{
                        relationType: RELATION_ENCL,
                        targets: enclosedNodes
                    }]
                };

                return waterline.nodes.updateByIdentifier(enclNode.id, updateData);
            }
        })
        .then(function () {
            // Add enclosure node info into compute node

            var updateData = {
                relations: [{
                    relationType: RELATION_ENCL_BY,
                    targets: [enclNode.id]
                }]
            };

            return waterline.nodes.updateByIdentifier(self.nodeId, updateData);
        })
        .then(function () {
            self._done();
        })
        .catch(function (err) {
            self._done(err);
        });

    };

    /**
     * Find serial number from node's catalog
     * @param {object} enclPath path in catalogs to get serail number
     * @return {Promise}
     */
    GenerateEnclosureJob.prototype._findSerialNumber = function (enclPath) {
        var self = this;

        return waterline.catalogs.findMostRecent({
            node: self.nodeId,
            source: enclPath.src
        }).then(function (catalog) {
            var nodeSn = catalogSearch.getPath(catalog.data, enclPath.entry);
            var regex = /[\w]+$/;

            if (!nodeSn) {
                throw new Error("Could not find serial number in source: " + enclPath.src);
            }
            else if (nodeSn.match(regex) === null) {
                throw new Error("No valid serial number in SN: " + nodeSn);
            }
            else {
                return nodeSn;
            }
        });
    };

    /**
     * Find enclosure node that matches given catalog info
     *
     * @param {object} nodeSn node's serial number
     * @param {object} encls enclosure nodes
     * @return {object} matched serial number and enclosure node
     */
    function _matchEnclosure(nodeSn, encls) {
        var regex = /[\w]+$/;

        return _.transform(encls, function (result, encl) {
            var match = encl.name.match(regex);
            var enclSn;

            if (match === null) {
                // No serial number in enclosure name, jump to next entry
                return true;
            }

            enclSn = match[0];
            if (enclSn === nodeSn) {
                result.encl = encl;
                // Find the match and exit the loop
                return false;
            }
        }, {
            sn: nodeSn,
            encl: {}
        });
    }

    return GenerateEnclosureJob;
}
