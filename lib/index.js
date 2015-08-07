'use strict';

var amqp = require('amqplib');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var Stream = require('stream');

var Readable = Stream.Readable || require('readable-stream/readable');
var Writable = Stream.Writable || require('readable-stream/writable');

var delay = global.setImmediate || process.nextTick;

function ignore() {}

function butter(content, encoding) {
    if (content.constructor === {}.constructor) {
        content = JSON.stringify(content);
    }
    return typeof content === 'string' ? new Buffer(content, encoding || 'utf8') : content;
}

function margarine(buffer) {
    var bufferAsString = buffer.toString();
    var message;
    try {
        message = JSON.parse(bufferAsString);
    }
    catch (e) {
        message = bufferAsString;
    }
    return message;
}

function errorLater(obj) {
    return function (err) {
        delay(function () {
            obj.emit('error', err);
        });
    };
}

function patch(self, ready, methods) {
    methods.forEach(function (method) {
        if (self[method] && !self.hasOwnProperty(method)) {
            self[method] = function () {
                var args = arguments;
                ready.then(function () {
                    methods.forEach(function (method) {
                        delete self[method];
                    });
                    self[method].apply(self, args);
                });
            };
        }
    });
}

function close() {
    this.ch.close();
}

function end(chunk, encoding) {
    if (chunk !== undefined) {
        this.write(chunk, encoding);
    }
    this.close();
}

function setsockopt(opt, value) {
    switch (opt) {
    case 'prefetch':
        this.ch.prefetch(value);
        break;
    case 'expiration':
    case 'persistent':
    case 'topic':
    case 'task':
        this.options[opt] = value;
        break;
    }
}

function addSocketMethods(Class) {
    Class.prototype.close = close;
    Class.prototype.setsockopt = setsockopt;
}

function Socket(channel, options) {
    var self = this;

    this.options = options = options || {};

    var ready = channel.then(function (ch) {
        self.ch = ch;
    });

    patch(self, ready, [
        'close',
        'write',
        'end',
        'connect',
        'setsockopt',
        'ack',
        'requeue',
        'discard',
        'publish'
    ]);

    function closeAndInvalidate(event, err) {
        this.readable = this.writable = false;
        delay(this.emit.bind(this, event, err));
    }

    var close = closeAndInvalidate.bind(this, 'close');
    var error = closeAndInvalidate.bind(this, 'error');

    channel.then(function (ch) {
        ch.on('close', close);
        ch.on('error', error);
        ch.on('drain', self.emit.bind(self, 'drain'));
        ch.on('readable', self.emit.bind(self, 'readable'));
    });

    ready.then(function () {
            for (var opt in options) {
                self.setsockopt(opt, options[opt]);
            }
        })
        .then(null, errorLater(this));
}

function PubSocket(channel, options) {
    Writable.call(this);
    options = options || {};
    Socket.call(this, channel, options);
}
inherits(PubSocket, Writable);
addSocketMethods(PubSocket);
PubSocket.prototype.end = end;
PubSocket.prototype.connect = function (exchange, callback) {
    var ch = this.ch;
    return ch.assertExchange(exchange, 'topic', {
            durable: true
        })
        .then(callback);
};
PubSocket.prototype.publish = function (exchange, routingKey, content, options) {
    var ch = this.ch;
    options = options || {};
    options.mandatory = options.mandatory ? true : false;
    options.persistent = options.persistent ? true : false;
    return ch.publish(exchange, routingKey, butter(content), options);
};

function SubSocket(channel, options) {
    Readable.call(this, {
        objectMode: true
    });
    options = options || {};
    options.noAck = options.noAck ? true : false;
    options.prefetch = options.prefetch || 0;
    this.unacked = [];
    Socket.call(this, channel, options);
}
inherits(SubSocket, Readable);
addSocketMethods(SubSocket);
SubSocket.prototype.end = end;
SubSocket.prototype.connect = function (exchange, queue, routingKey, callback) {
    var ch = this.ch;
    var self = this;
    return ch.assertQueue(queue, {
            durable: true
        })
        .then(function () {
            return ch.assertExchange(exchange, 'topic', {
                    durable: true
                })
                .then(function () {
                    return ch.bindQueue(queue, exchange, routingKey);
                })
                .then(function (ok) {
                    self.queue = ok.queue;
                    return ch.consume(ok.queue, function (message) {
                            if (message && !self.options.noAck) {
                                self.unacked.push(message);
                            }
                            self.push(margarine(message.content));
                        }, {
                            noAck: self.options.noAck
                        })
                        .then(function () {
                            return ch;
                        });
                });
        })
        .then(callback);
};
SubSocket.prototype.ack = function () {
    var message = this.unacked.shift();
    if (!message) {
        throw new Error('ack called with no unacknowledged messages');
    }
    this.ch.ack(message);
};
SubSocket.prototype.requeue = function () {
    var message = this.unacked.shift();
    if (!message) {
        throw new Error('requeue called with no unacknowledged messages');
    }
    this.ch.reject(message);
};
SubSocket.prototype.discard = function () {
    var message = this.unacked.shift();
    if (!message) {
        throw new Error('discard called with no unacknowledged messages');
    }
    this.ch.reject(message, false);
};
SubSocket.prototype._read = ignore;

var SOCKETS = {
    PUB: PubSocket,
    PUBLISH: PubSocket,
    SUB: SubSocket,
    SUBSCRIBE: SubSocket
};

module.exports = SOCKETS;

function Context(url, connOpts) {
    EventEmitter.call(this);
    var self = this;
    var onError = errorLater(this);
    var c = this._connection = amqp.connect(url, connOpts);
    c.then(function (conn) {
        conn.on('error', onError);
        [
            'close',
            'blocked',
            'unblocked'
        ].forEach(function (ev) {
            conn.on(ev, self.emit.bind(self, ev));
        });
    });
    c.then(this.emit.bind(this, 'ready')).then(null, onError);
}
inherits(Context, EventEmitter);

Context.prototype.socket = function (type, options) {
    var Ctr = SOCKETS[type];
    if (Ctr) {
        var s = new Ctr(this._connection.then(function (c) {
            return c.createChannel();
        }), options);
        return s;
    }
    else {
        throw new Error('Undefined socket type ' + type);
    }
};

Context.prototype.close = function (callback) {
    this._connection.then(function (c) {
        c.close().then(callback);
    });
};

module.exports.Context = Context;
