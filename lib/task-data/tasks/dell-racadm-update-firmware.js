// Copyright 2016, EMC, Inc.

'use strict';

module.exports = {
    friendlyName: 'dell racadm update firmware image',
    injectableName: 'Task.Dell.Racadm.Update.Firmware',
    implementsTask: 'Task.Base.Dell.Racadm.Update.Firmware',
    options: {
        serverUsername: null,
        serverPassword: null,
        serverFilePath: null,
        action: 'updateFirmware'
    },
    properties: {}
};
