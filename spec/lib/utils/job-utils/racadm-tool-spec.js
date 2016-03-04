// Copyright 2016, EMC, Inc.
/* jshint node: true */

'use strict';

describe("racadm-tool", function() {
    var instance, parser;

    var mockChildProcessFactory = function() {
        function MockChildProcess(command, args, env) {
            this.command = command;
            this.args = args;
            this.env = env;
        }
        MockChildProcess.prototype.run = function () {
            var self = this;
            var args = self.args;
            var subCommandIndex = args.join(' ').indexOf('get BIOS'),
                pwdIndex = args.join(' ').indexOf('-p admin'),
                hostIndex = args.join(' ').indexOf('-r ');

            //local racadm command case
            if (hostIndex === -1){
                return Promise.resolve({
                    stdout: 'Get BIOS Correctly'
                });
            }

            //remote racadm command case
            if( subCommandIndex !== -1) {
                    if (pwdIndex !== -1) {
                        return Promise.resolve({
                            stdout: 'Get BIOS Correctly'
                        });
                    } else {
                        return Promise.reject({
                            stderr: 'ERROR: Login failed - invalid username or password\n'
                        });
                    }
            }
        };
        return MockChildProcess;
    };

    before('racadm tool before', function() {
        helper.setupInjector([
            helper.require('/lib/utils/job-utils/racadm-tool'),
            helper.require('/lib/utils/job-utils/racadm-parser'),
            helper.di.simpleWrapper(mockChildProcessFactory(), 'ChildProcess')
        ]);
        instance = helper.injector.get('JobUtils.RacadmTool');
        parser = helper.injector.get('JobUtils.RacadmCommandParser');

    });

    describe('instance', function(){

        before(function() {
            this.sandbox = sinon.sandbox.create();
        });

        describe('runCommand', function(){
            afterEach('runCommand after', function() {
                this.sandbox.restore();
            });

            it('should get console standard out if succeed', function() {
                return instance.runCommand('192.168.188.103','admin', 'admin', 'get BIOS')
                    .then(function(ret){
                        expect(ret).to.be.equals('Get BIOS Correctly');
                    });
            });

            it('should get console standard error if failed', function() {
                return instance.runCommand('192.168.188.103','admin', 'admi', 'get BIOS')
                    .should.be.rejected;
            });

            it('should get console standard out if tried local command', function() {
                return instance.runCommand('','admin', 'admin', 'get BIOS')
                    .then(function(ret){
                        expect(ret).to.be.equals('Get BIOS Correctly');
                    });
            });

        });

        describe('enableIpmi', function(){
            afterEach('runCommand after', function() {
                this.sandbox.restore();
            });

            it('enableIpmi exists', function() {
                should.exist(instance.enableIpmi);
            });
            it('enableIpmi is a function', function() {
                expect(instance.enableIpmi).is.a('function');
            });

            it('should enable IPMI', function(){
                this.sandbox.stub(instance, 'runCommand').resolves();
                return instance.enableIpmi('any','any','any')
                    .then(function(){
                        expect(instance.runCommand).to.have.been.calledOnce;
                    });
            });
        });

        describe('disableIpmi', function(){
            afterEach('runCommand after', function() {
                this.sandbox.restore();
            });

            it('disableIpmi exists', function() {
                should.exist(instance.disableIpmi);
            });
            it('disableIpmi is a function', function() {
                expect(instance.disableIpmi).is.a('function');
            });

            it('should disable IPMI', function(){
                this.sandbox.stub(instance, 'runCommand').resolves();
                return instance.disableIpmi('any','any','any')
                    .then(function(){
                        expect(instance.runCommand).to.have.been.calledOnce;
                    });
            });
        });

        describe('getLatestJobId', function(){
            var jobqueueMock = require('./stdout-helper').racadmJobqueueData;
            var runCommandStub;

            beforeEach('getLatestJobId before', function() {
                runCommandStub = this.sandbox.stub(instance, 'runCommand');
            });

            afterEach('getLatestJobId before', function() {
                runCommandStub = this.sandbox.restore();
            });

            it('should get latest job Id', function() {
                runCommandStub.resolves(jobqueueMock);
                return instance.getLatestJobId('0.0.0.0', 'admin', 'admin')
                    .then(function(ret){
                        expect(instance.runCommand).to.be.calledWith('0.0.0.0', 'admin',
                            'admin', "jobqueue view");
                        expect(ret).to.equals("JID_561449281852");
                    });
            });

            it('should throw error if JID format is not correct', function(done){
                runCommandStub.resolves("");
                this.sandbox.stub(parser, "getJobStatus").returns({});
                return instance.getLatestJobId('192.168.188.103', 'admin', 'admin')
                    .then(function(){
                        done(new Error("Expected getLatestJobId to fail"));
                    })
                    .catch(function(err){
                        expect(parser.getJobStatus).to.be.calledOnce;
                        expect(err.message).to.equal('Job ID is not correct');
                        done();
                    });
            });
        });

        describe('getJobStatus', function(){
            before('setBiosConfig before', function() {
                this.jobId = 'JID_927008261880';
            });
            afterEach('setBiosConfig after', function() {
                this.sandbox.restore();
            });

            it('should get job status', function() {
                var self = this ;
                this.sandbox.stub(parser, 'getJobStatus').returns('somevalue');
                this.sandbox.stub(instance, 'runCommand').resolves();
                return instance.getJobStatus('192.168.188.103','admin', 'admin', self.jobId)
                    .then(function(ret){
                        expect(instance.runCommand).to.have.been.calledOnce;
                        expect(parser.getJobStatus).to.have.been.calledOnce;
                        expect(ret).to.equals('somevalue');
                    });
            });

            it('should throw errors', function(done) {
                var self = this ;
                this.sandbox.stub(parser, 'getJobStatus').returns();
                this.sandbox.stub(instance, 'runCommand').rejects({error: "Error happened"});
                return instance.getJobStatus('192.168.188.103','admin', 'admin', self.jobId)
                    .then(function() {
                        done(new Error("Expected getJobStatus to throw errors"));
                    })
                    .catch(function(err){
                        expect(instance.runCommand).to.have.been.calledOnce;
                        expect(parser.getJobStatus).to.not.have.been.called;
                        expect(err.error).to.equals("Error happened");
                        done();
                    });
            });

        });

        describe('waitJobDone', function(){
            var getJobStatusStub, waitJobDoneSpy;
            beforeEach('waitJobDone before', function() {
                getJobStatusStub = this.sandbox.stub(instance, 'getJobStatus');
                waitJobDoneSpy = this.sandbox.spy(instance, 'waitJobDone');
                this.jobId = 'JID_927008261880';
                this.jobStatus = {
                    jobId: 'JID_927008261880',
                    jobName: 'Configure: Import system configuration XML file',
                    status: 'Completed',
                    startTime: 'Not Applicable',
                    expirationTime: 'Not Applicable',
                    message:
                        'SYS053: Successfully imported and applied system configuration XML file.',
                    percentComplete: '100'
                };
            });
            afterEach('waitJobDone after', function() {
                this.sandbox.restore();
            });

            it('should get job completion status correctly', function() {
                var self = this ;
                getJobStatusStub.resolves(self.jobStatus);
                return instance.waitJobDone('192.168.188.103','admin', 'admin', self.jobId, 0, 100)
                    .then(function(ret){
                        expect(instance.getJobStatus).to.have.been.calledOnce;
                        expect(ret).to.deep.equals(self.jobStatus);
                    });
            });

            it('should throw job failed errors', function(done) {
                var self = this ;
                self.jobStatus.status = 'Failed';
                getJobStatusStub.resolves(self.jobStatus);
                return instance.waitJobDone('192.168.188.103','admin', 'admin', self.jobId, 0, 100)
                    .then(function() {
                        done(new Error("Expected waitJobDone to throw errors"));
                    })
                    .catch(function(err){
                        expect(err).to.deep.equals(
                            new Error('Job Failed during process, jobStatus: ' +
                            JSON.stringify(self.jobStatus))
                        );
                        expect(instance.getJobStatus).to.be.calledOnce;
                        done();
                    });
            });

            it('should get job completion status correctly after iteration', function() {
                var self = this,
                    runningJobStatus = {
                        jobId: 'JID_927008261880',
                        jobName: 'Configure: Import system configuration XML file',
                        status: 'Running',
                        startTime: 'Not Applicable',
                        expirationTime: 'Not Applicable',
                        message:
                            'SYS053: Successfully imported and applied system ' +
                            'configuration XML file.',
                        percentComplete: '100'
                    };

                getJobStatusStub.resolves(runningJobStatus)
                    .onCall(3).resolves(self.jobStatus);

                return instance.waitJobDone('192.168.188.103','admin', 'admin', self.jobId, 0, 0.1)
                    .then(function() {
                        expect(instance.waitJobDone.callCount).to.equal(4);
                        expect(instance.getJobStatus.callCount).to.equal(4);
                    });
            });

            it('should call itself until timeout', function(done) {
                var self = this ;
                self.jobStatus.status = 'Running';
                getJobStatusStub.resolves(self.jobStatus);
                return instance.waitJobDone('192.168.188.103','admin', 'admin', self.jobId, 0, 0)
                    .then(function() {
                        done(new Error("Expected waitJobDone to fail"));
                    })
                    .catch(function(err) {
                        expect(instance.waitJobDone.callCount).to.equal(11);
                        expect(instance.getJobStatus.callCount).to.equal(11);
                        expect(err).to.deep.equals(
                            new Error('Job Timeout, jobStatus: ' +
                            JSON.stringify(self.jobStatus))
                        );
                        done();
                    });
            });

        });

        describe('run async commands', function(){
            var runCommandStub, getJobIdStub, waitJobDoneStub;
            beforeEach('run async commands before', function() {
                runCommandStub = this.sandbox.stub(instance, 'runCommand');
                getJobIdStub = this.sandbox.stub(parser, 'getJobId');
                waitJobDoneStub = this.sandbox.stub(instance, 'waitJobDone');
            });

            afterEach('run async commands after', function() {
                this.sandbox.restore();
            });

            it('should run commands and get completion status', function(){
                var command = "set -f bios.xml -t xml -u " +
                        "onrack -p onrack -l //192.168.188.113/share";
                runCommandStub.resolves();
                getJobIdStub.returns();
                waitJobDoneStub.resolves();
                return instance.runAsyncCommands('192.168.188.113','admin', 'admin',
                    command, 0, 1000)
                    .then(function(){
                        expect(instance.runCommand).to.be.calledWith('192.168.188.113',
                            'admin', 'admin', command);
                        expect(parser.getJobId).to.have.been.calledOnce;
                        expect(instance.waitJobDone).to.have.been.called;
                    });
            });

            it('should report errors if promise failure', function(){
                var command = "set -f bios.xml -t xml -u " +
                    "onrack -p onrack -l //192.168.188.113/share";
                runCommandStub.resolves();
                getJobIdStub.returns();
                waitJobDoneStub.rejects({error: "Error happend"});
                return instance.runAsyncCommands('192.168.188.113','admin', 'admin',
                    command, 0, 1000).should.be.rejectedWith({error: "Error happend"});
            });

        });

        describe('setBiosConfig', function(){
            var runAsyncCommandsStub, getPathFilenameStub;
            beforeEach('setBiosConfig before', function() {
                runAsyncCommandsStub = this.sandbox.stub(instance, 'runAsyncCommands');
                getPathFilenameStub = this.sandbox.stub(parser, 'getPathFilename');
                this.cifsConfig = {
                    user: 'onrack',
                    password: 'onrack',
                    filePath: '//192.168.188.113/share/bios.xml'
                };
                this.fileInfo = {
                    name: 'bios.xml',
                    path: '//192.168.188.113/share',
                    style: 'remote'
                };
            });

            afterEach('setBiosConfig after', function() {
                this.sandbox.restore();
            });

            it('should throw Error if no pathFile is found', function(){
                expect( function() {
                    return instance.setBiosConfig('192.168.188.103', 'admin', 'admin');
                }).throw(Error, 'Can not find file path required for set BIOS configuration');
            });

            it('should set BIOS configure via remote file', function(){
                var self = this,
                    command = "set -f bios.xml -t xml -u " +
                        "onrack -p onrack -l //192.168.188.113/share";
                getPathFilenameStub.returns(self.fileInfo);
                runAsyncCommandsStub.resolves();
                return instance.setBiosConfig('192.168.188.113','admin', 'admin', self.cifsConfig)
                    .then(function(){
                        expect(instance.runAsyncCommands).to.be.calledWith('192.168.188.113',
                            'admin', 'admin', command, 0, 1000);
                        expect(parser.getPathFilename).to.have.been.calledOnce;
                    });
            });

            it('should set BIOS configure via local file', function(){
                var self = this,
                    command = "set -f /home/share/bios.xml -t xml";
                self.fileInfo.path = '/home/share';
                self.fileInfo.style = 'local';
                getPathFilenameStub.returns(self.fileInfo);
                runAsyncCommandsStub.resolves();
                return instance.setBiosConfig('192.168.188.113','admin', 'admin',
                    {filePath: '/home/share/bios.xml'})
                    .then(function(){
                        expect(instance.runAsyncCommands).to.be.calledWith('192.168.188.113',
                            'admin', 'admin', command, 0, 1000);
                        expect(parser.getPathFilename).to.have.been.calledOnce;
                    });
            });

            it('should failed if get promise failure', function(){
                var self = this;
                getPathFilenameStub.returns(self.fileInfo);
                runAsyncCommandsStub.rejects({error: "Error happend"});
                return instance.setBiosConfig('192.168.188.103','admin', 'admin', self.cifsConfig).
                    should.be.rejectedWith({error: "Error happend"});
            });

        });

        describe('updateFirmware', function(){
            var runCommandStub, getPathFilenameStub, getLatestJobIdStub, waitJobDoneStub;
            beforeEach('updateFirmware before', function() {
                runCommandStub = this.sandbox.stub(instance, 'runCommand');
                getPathFilenameStub = this.sandbox.stub(parser, 'getPathFilename');
                getLatestJobIdStub = this.sandbox.stub(instance, 'getLatestJobId');
                waitJobDoneStub = this.sandbox.stub(instance, 'waitJobDone');
                this.cifsConfig = {
                    user: 'onrack',
                    password: 'onrack',
                    filePath: '//192.168.188.113/share/firmimg.d7'
                };
                this.fileInfo = {
                    name: 'firmimg.d7',
                    path: '//192.168.188.113/share',
                    style: 'remote'
                };
            });

            afterEach('updateFirmware after', function() {
                this.sandbox.restore();
            });

            it('should throw Error if no pathFile is found', function(){
                expect( function() {
                    return instance.updateFirmware('192.168.188.103', 'admin', 'admin');
                }).throw(Error, 'Can not find file path required for iDRAC image update');
            });

            it('should update idrac image via remote file', function(){
                var self = this,
                    command = "update -f firmimg.d7 -u onrack -p onrack -l //192.168.188.113/share";
                getPathFilenameStub.returns(self.fileInfo);
                runCommandStub.resolves();
                getLatestJobIdStub.returns('JID_xxxxxxxx');
                waitJobDoneStub.resolves();
                return instance.updateFirmware('192.168.188.113','admin', 'admin',
                    self.cifsConfig)
                    .then(function(){
                        expect(instance.runCommand).to.be.calledWith('192.168.188.113',
                            'admin', 'admin', command, 0, 1000);
                    });
            });

            it('should set BIOS configure via local file', function(){
                var self = this,
                    command = "update -f /home/share/firmimg.d7";
                self.fileInfo.path = '/home/share';
                self.fileInfo.style = 'local';
                getPathFilenameStub.returns(self.fileInfo);
                runCommandStub.resolves();
                getLatestJobIdStub.returns('JID_xxxxxxxx');
                waitJobDoneStub.resolves();
                return instance.updateFirmware('192.168.188.113','admin', 'admin',
                    {filePath: "/home/share/firmimg.d7"})
                    .then(function(){
                        expect(instance.runCommand).to.be.calledWith('192.168.188.113',
                            'admin', 'admin', command, 0, 1000);
                        expect(instance.runCommand).to.be.calledTwice;
                        expect(parser.getPathFilename).to.have.been.calledOnce;
                        expect(instance.getLatestJobId).to.have.been.calledOnce;
                        expect(instance.waitJobDone).to.have.been.calledOnce;
                    });
            });

            it('should failed if get promise failure', function(){
                var self = this;
                getPathFilenameStub.returns(self.fileInfo);
                runCommandStub.rejects({error: "Error happend"}).onFirstCall();
                return instance.updateFirmware('192.168.188.103','admin', 'admin',
                    self.cifsConfig).should.be.rejectedWith({error: "Error happend"});
            });

            it('should throw error if image file is not in .d7, .exe or .EXE format', function(){
                var self = this;
                self.fileInfo.name = 'firmimg';
                getPathFilenameStub.returns(self.fileInfo);
                expect( function() {
                    return instance.updateFirmware('192.168.188.103', 'admin', 'admin',
                        self.cifsConfig);
                }).throw(Error, 'Image format is not supported');
            });

        });

        describe('getSoftwareList', function(){
            var runCommandStub, getSoftwareListStub;
            beforeEach('getSoftwareList before', function() {
                runCommandStub = this.sandbox.stub(instance, 'runCommand');
                getSoftwareListStub = this.sandbox.stub(parser, 'getSoftwareList');
            });

            afterEach('updateFirmware after', function() {
                this.sandbox.restore();
            });

            it('should get software list correctly', function(){
                runCommandStub.resolves();
                getSoftwareListStub.returns();
                return instance.getSoftwareList('0.0.0.0', 'user', 'password')
                    .then(function(){
                        expect(parser.getSoftwareList).to.be.calledOnce;
                        expect(instance.runCommand).to.be.calledOnce;
                        expect(instance.runCommand).to.be.calledWith('0.0.0.0', 'user',
                            'password', 'swinventory');
                    });
            });

        });

        describe('getBiosConfig', function(){
            var runAsyncCommandsStub, getPathFilenameStub, getSoftwareListStub;
            beforeEach('updateFirmware before', function() {
                runAsyncCommandsStub = this.sandbox.stub(instance, 'runAsyncCommands');
                getPathFilenameStub = this.sandbox.stub(parser, 'getPathFilename');
                getSoftwareListStub = this.sandbox.stub(instance, 'getSoftwareList');
                this.cifsConfig = {
                    user: 'onrack',
                    password: 'onrack',
                    filePath: '//192.168.188.113/share/bios.xml'
                    };
                this.fileInfo = {
                    name: 'bios.xml',
                    path: '//192.168.188.113/share',
                    style: 'remote'};
            });

            afterEach('updateFirmware after', function() {
                this.sandbox.restore();
            });

            it("should get bios configure to remote path", function(){
                var command = 'get -f bios.xml -t xml -u onrack -p onrack -l ' +
                    '//192.168.188.113/share -c BIOS.Setup.1-1';
                getSoftwareListStub.returns({BIOS:{FQDD: 'BIOS.Setup.1-1'}});
                getPathFilenameStub.returns(this.fileInfo);
                runAsyncCommandsStub.resolves();
                return instance.getBiosConfig('192.168.188.103', 'admin', 'admin', this.cifsConfig)
                    .then(function(){
                        expect(parser.getPathFilename).to.be.calledOnce;
                        expect(instance.getSoftwareList).to.be.calledOnce;
                        expect(instance.runAsyncCommands).to.be.calledOnce;
                        expect(instance.runAsyncCommands).to.be.calledWith('192.168.188.103',
                            'admin', 'admin', command, 0, 1000);
                    });
            });

            it('should get bios configure to local path', function(){
                var command = "get -f /tmp/configure.xml -t xml -c BIOS.Setup.1-1";
                this.fileInfo.path = '/tmp';
                this.fileInfo.style = 'local';
                getSoftwareListStub.returns({BIOS:{FQDD: 'BIOS.Setup.1-1'}});
                getPathFilenameStub.returns(this.fileInfo);
                runAsyncCommandsStub.resolves();
                return instance.getBiosConfig('192.168.188.103', 'admin', 'admin')
                    .then(function(){
                        expect(instance.runAsyncCommands).to.be.calledWith('192.168.188.103',
                            'admin', 'admin', command, 0, 1000);
                    });
            });

            it("should throw error", function(){
                var self = this;
                getSoftwareListStub.returns({BIOS:{status: 'BIOS.Setup.1-1'}});
                return instance.getBiosConfig('192.168.188.103', 'admin', 'admin', self.cifsConfig)
                    .should.be.rejectedWith(Error, 'Can not get BIOS FQDD');
            });

        });

    });
});
