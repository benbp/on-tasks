// Copyright 2016, EMC, Inc.

'use strict';

module.exports = {
    friendlyName: 'In-band Validation',
    injectableName: 'Task.Ssh.ValidateIn-band',
    implementsTask: 'Task.Base.Ssh',
    options: {
        commands: [
            ':'
        ]
    },
    properties: {}
};
