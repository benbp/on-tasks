// Copyright 2015, EMC, Inc.

'use strict';

module.exports = {
    friendlyName: 'Install OS',
    injectableName: 'Task.Base.Os.Install',
    runJob: 'Job.Os.Install',
    requiredOptions: [
        'profile',
        'completionUri'
    ],
    requiredProperties: {
    },
    properties: {
        os: {
            type: 'install'
        }
    }
};
