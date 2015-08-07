'use strict';

var rabbit = require('../');

var exchangeName = 'events';
var queueName = 'events';
var routingKey = 'events';

var context = rabbit.createContext('amqp://127.0.0.1');
context.on('ready', function () {
    var publisher = context.socket('PUBLISH');
    var subscriber = context.socket('SUBSCRIBE');
    // var subscriber = context.socket('SUBSCRIBE', [options]);,
    // options for SUBSCRIBE
    //     noAck: bool (true means it will process as fast as it can), default: false, must always ack
    //     prefetch: # how many messages to pickup before waiting until processing is done, default: unlimited
    subscriber.connect(exchangeName, queueName, routingKey, function () {
        subscriber.on('data', function (message) {
            subscriber.ack();
            console.log('Message from events');
            console.log(message);
        });
    });
    setTimeout(function () {
        publisher.connect(exchangeName, function () {
            // publisher.publish(exchangeName, routingKey, { welcome: 'rabbit' }, [options]);
            // options for publish
            //  mandatory: bool
            publisher.publish(exchangeName, routingKey, {
                welcome: 'rabbit'
            });
        });
    }, 1500);
});
context.on('error', function () {
    console.log(arguments);
});
