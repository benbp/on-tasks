// Copyright 2015, EMC, Inc.

'use strict';

var di = require('di');

module.exports = ansibleFactory;

di.annotate(ansibleFactory, new di.Provide('JobUtils.Ansible.Playbook'));
di.annotate(ansibleFactory, new di.Inject(
            'Assert',
            'ChildProcess'
));

function ansibleFactory(assert, ChildProcess) {
    /**
     * @constructor
     */
    function AnsibleTool() {
        this.childProcess = undefined;
    }

    AnsibleTool.prototype.runPlaybook = function(nodeid, playbook, extraArgs) {
        var env = {
            'nodeid': nodeid
        };
        var args = [ '-i', '/opt/onrack/etc/ansible/rackhd.py' ];
        if( extraArgs )  {
          args.push("--extra-vars");
          args.push(extraArgs);
        }
        args.push(playbook);

        var maxBuffer = 3000 * 1024;
        this.childProcess = new ChildProcess('/usr/bin/ansible-playbook',
                                             args,
                                             env,
                                             null,
                                             maxBuffer);
        return this.childProcess.run();
    };

    AnsibleTool.prototype.kill = function() {
        if(this.childProcess) {
            this.childProcess.killSafe();
        }
    };

    return AnsibleTool;
}
