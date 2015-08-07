# Messaging in Node.JS with RabbitMQ

```
$ npm install @icehunter/rabbit -S
```

## Simple Usage

```javascript
var rabbit = require('../');

var exchangeName = 'events';
var queueName = 'events';
var routingKey = 'events';

// url: amqp(s)://127.0.0.1
// var context = rabbit.createContext(url, connectionOptions);
var context = rabbit.createContext();
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
```

If you want multi-routing initialize multiple sockets like so:

```javascript
var rabbit = require('../');

var exchangeName = 'events';

var newQueueName = 'events:new';
var newRoutingKey = 'events:new';

var updateQueueName = 'events:update';
var updateRoutingKey = 'events:update';

// url: amqp(s)://127.0.0.1
// var context = rabbit.createContext(url, connectionOptions);
var context = rabbit.createContext();
context.on('ready', function () {
    var publisher = context.socket('PUBLISH');
    var newSubscriber = context.socket('SUBSCRIBE');
    // var newSubscriber = context.socket('SUBSCRIBE', [options]);,
    // options for SUBSCRIBE
    //     noAck: bool (true means it will process as fast as it can), default: false, must always ack
    //     prefetch: # how many messages to pickup before waiting until processing is done, default: unlimited
    newSubscriber.connect(exchangeName, newQueueName, newRoutingKey, function () {
        newSubscriber.on('data', function (message) {
            newSubscriber.ack();
            console.log('Message from events:new');
            console.log(message);
        });
    });
    var updateSubscriber = context.socket('SUBSCRIBE');
    // var updateSubscriber = context.socket('SUBSCRIBE', [options]);,
    // options for SUBSCRIBE
    //     noAck: bool (true means it will process as fast as it can), default: false, must always ack
    //     prefetch: # how many messages to pickup before waiting until processing is done, default: unlimited
    updateSubscriber.connect(exchangeName, updateQueueName, updateRoutingKey, function () {
        updateSubscriber.on('data', function (message) {
            updateSubscriber.ack();
            console.log('Message from events:update');
            console.log(message);
        });
    });
    setTimeout(function () {
        publisher.connect(exchangeName, function () {
            // publisher.publish(exchangeName, routingKey, { welcome: 'rabbit' }, [options]);
            // options for publish
            //  mandatory: bool
            publisher.publish(exchangeName, newRoutingKey, {
                welcome: 'new'
            });
            publisher.publish(exchangeName, updateRoutingKey, {
                welcome: 'update'
            });
        });
    }, 1500);
});
context.on('error', function () {
    console.log(arguments);
});
```
