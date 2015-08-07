'use strict';

var sockets = require('./lib');

module.exports = sockets;
module.exports.createContext = function (url, connectionOptions) {
    return new sockets.Context(url, connectionOptions);
};
