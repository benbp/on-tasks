// Copyright 2015, EMC, Inc.
/* jshint node: true */

'use strict';

describe('OBM Service', function() {
    var ObmService;
    var obmService;
    var Logger;

    before('OBM Service before', function() {
        helper.setupInjector([
            helper.require('/lib/services/obm-service'),
            helper.require('/lib/services/ipmi-obm-service'),
            helper.require('/lib/services/base-obm-service')
        ]);
        ObmService = helper.injector.get('Task.Services.OBM');
        Logger = helper.injector.get('Logger');
        sinon.stub(Logger.prototype, 'log');
    });

    after('OBM Service after', function() {
        Logger.prototype.log.restore();
    });

    describe('retryObmCommand', function() {
        before('retryObmCommand before', function() {
            var obmSettings = {
                "service": "ipmi-obm-service",
                "config": {
                    "user": "admin",
                    "password": "admin",
                    "host": "10.0.0.254"
                }
            };
            var ipmiObmServiceFactory = helper.injector.get('ipmi-obm-service');
            obmService = ObmService.create('54da9d7bf33e0405c75f7000',
                ipmiObmServiceFactory, obmSettings, 0, 3);

            sinon.stub(obmService, 'runObmCommand');
            sinon.spy(obmService, '_retryObmCommand');
        });

        beforeEach('retryObmCommand before each', function() {
            obmService.runObmCommand.reset();
            obmService._retryObmCommand.reset();
        });

        after('retryObmCommand after', function() {
            obmService.runObmCommand.restore();
            obmService._retryObmCommand.restore();
        });

        it('should not retry an OBM command on an actual failure', function() {
            obmService.runObmCommand.rejects(new Error('test error'));
            return expect(obmService.retryObmCommand('testcommand'))
                .to.be.rejectedWith(/test error/);
        });

        it('should not fail on a config error when the command is setBootPxe', function() {
            var error = new Error('test config error');
            error.name = 'ObmConfigurationError';
            obmService.runObmCommand.rejects(error);
            return obmService.retryObmCommand('setBootPxe').should.become(undefined);
        });

        it('should retry an OBM command if expected output does not match', function(done) {
            obmService.runObmCommand.resolves('testoutput');

            obmService.retryObmCommand('testcommand', 'badoutput')
            .then(function() {
                done(new Error("Expected retryObmCommand to fail"));
            })
            .catch(function() {
                expect(obmService.runObmCommand.callCount).to.equal(4);
                expect(obmService._retryObmCommand.callCount).to.equal(4);
                done();
            });
        });

        it('should succeed an OBM command if expected output matches after ' +
                'not matching on previous runs', function() {
            obmService.runObmCommand.resolves('testoutput').onCall(3).resolves('somevalue');

            return obmService.retryObmCommand('testcommand', 'somevalue')
            .then(function() {
                expect(obmService.runObmCommand.callCount).to.equal(4);
                expect(obmService._retryObmCommand.callCount).to.equal(4);
            });
        });
    });

    describe('Check invalid obm service', function() {

        it('should return empty when no invalid service', function() {
            var obmSettings = [
                {
                    config: {},
                    service: 'panduit-obm-service'
                }
            ];
            var node = {
                id: '123',
                type: 'enclosure'
            };

            return expect(ObmService.checkInvalidService(node, obmSettings))
                .to.equal('');
        });

        it('should return empty when no specified node type', function() {
            var obmSettings = [
                {
                    config: {},
                    service: 'noop-obm-service'
                }
            ];
            var node = {
                id: '123',
            };

            return expect(ObmService.checkInvalidService(node, obmSettings))
                .to.equal('');
        });

        it('should return invalid service when only input one obm setting', function() {
            var obmSettings = {
                    config: {},
                    service: 'ipmi-obm-service'
            };
            var node = {
                id: '123',
                type: 'enclosure'
            };

            return expect(ObmService.checkInvalidService(node, obmSettings))
                .to.equal('ipmi-obm-service');
        });

        it('should return invalid service', function() {
            var obmSettings = [
                {
                    config: {},
                    service: 'ipmi-obm-service'
                },
                {
                    config: {},
                    service: 'noop-obm-service'
                }
            ];
            var node = {
                id: '123',
                type: 'enclosure'
            };

            return expect(ObmService.checkInvalidService(node, obmSettings))
                .to.equal('ipmi-obm-service');
        });
    });
});
