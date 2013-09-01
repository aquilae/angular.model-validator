
(function () {
    "use strict";

    var $http = require('http'),
        $fs = require('fs');

    $http.createServer(function (req, res) {
        if (req.url === '/src/angular.model-validator.js') {
            res.writeHead(200, {'Content-Type': 'text/javascript;charset=utf-8'});
            res.end($fs.readFileSync('./src/angular.model-validator.js'));
        }
        else {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end($fs.readFileSync('./example.html'));
        }
    }).listen(8080, '127.0.0.1');
})();
