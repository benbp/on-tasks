// Copyright 2016, EMC, Inc.

'use strict';


module.exports = {
    friendlyName: 'Scp',
    injectableName: 'Task.Base.Scp',
    runJob: 'Job.Scp',
    requiredOptions: [
        'fileSource',
        'fileDestination'
    ],
    requiredProperties: {},
    properties: {}
};
