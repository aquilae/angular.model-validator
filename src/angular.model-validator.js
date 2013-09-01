
(function (angular) {
    "use strict";

    var module = angular.module('aq.modelValidator', []);

    var $validatorProvider = function $validatorProvider() {
        this.validators = {
            'required': {
                'message': null,
                'messages': {
                    'required': 'The field is required',
                    'minlen': 'Value should be at least {minlen} characters long',
                    'maxlen': 'Value should be at most {maxlen} characters long'
                },
                'minlen': 0,
                'maxlen': +Infinity,
                '$params': ['minlen', 'maxlen'],
                '$func': function (value, context, callback) {
                    console.log('value:', value, 'minlen:', context.minlen, 'maxlen:', context.maxlen);
                    if (angular.isDefined(value)) {
                        if (value !== null) {
                            var str = '' + value;
                            if (str.length > 0) {
                                if (str.length >= Math.max(parseInt(context.minlen), 0)) {
                                    if (str.length < parseInt(context.maxlen)) {
                                        return callback(true);
                                    }
                                    return callback(false, context.message || context.messages.maxlen);
                                }
                                return callback(false, context.message || context.messages.minlen);
                            }
                        }
                    }
                    return callback(false, context.message || context.messages.required);
                }
            },
            'rx': {
                'message': 'Value does not match required pattern',
                'pattern': null,
                '$func': function (value, context, callback) {
                    if (context.pattern) {
                        var pattern = (angular.isString(context.pattern)
                            ? new RegExp(context.pattern) : context.pattern);
                        if (!pattern.test(value)) {
                            return callback(false, context.message);
                        }
                    }
                    return callback(true);
                }
            },
            'jsonp': {
                'messages': {
                    'default': 'Server validation failed',
                    'serverError': 'Server returned an error'
                },
                'url': null,
                'config': {},
                '$func': ['$window', '$http', function ($window, $http) {
                    return function (value, context, callback) {
                        var url = angular.isString(context.url) ? context.url : null,
                            cfg = angular.isObject(context.config) ? context.config : null;

                        if (cfg === null) {
                            if (url === null) {
                                return callback(true);
                            }
                            cfg = {};
                        }

                        return (
                            $http
                                .jsonp(url, cfg)
                                .success(function (res) {
                                    callback(res.result, res.message
                                        || context.messages['default']);
                                })
                                .error(function () {
                                    callback(context.messages.serverError);
                                })
                        );
                    }
                }]
            }
        };
        this.addValidator = function addValidator(type, context, $func, $params) {
            this.validators[type] = angular.extend(
                {}, context, {
                    '$func': $func,
                    '$params': $params
                }
            );
        };
        this.exprRegex = /^(.+?)\((.+)\)$/;
        this.parseExpr = function parseExpr(expr) {
            var match = this.exprRegex.exec(expr);
            if (!match) {
                if (!this.validators[expr]) {
                    throw 'validator not found: ' + expr;
                }
                return { type: expr };
            }
            var type = match[1],
                args = eval('[' + match[2] + ']'),
                validator = this.validators[type];

            if (!validator) {
                throw 'validator not found: ' + type;
            }

            var context = {},
                i = 0,
                ii = Math.min(args.length, (validator.$params || []).length);

            for (; i < ii; ++i) {
                context[validator.$params[i]] = args[i];
            }
            context.$type = type;
            return context;
        };
        this.$get = ['$injector', function $get($injector) {
            return $validatorService($injector, this);
        }];
    };

    var $validatorService = function $validatorService($injector, provider) {
        var service = function scope($scope) {
            return $scopedValidatorService(
                $injector, $scope, provider, service
            );
        };
        service.provider = provider;
        service.validators = {};
        service.exprRegex = null;
        service.parseExpr = null;
        return service;
    };

    var $scopedValidatorService = function $scopedValidatorService($injector, $scope, provider, service) {
        if (!$scope.$validator) {
            $scope.$validator = {
                rules: {},
                errors: {}
            };
        }

        var scoped = {
            service: service,
            validators: {},
            exprRegex: null,
            parseExpr: null,
            pending: null
        };

        scoped.rules = function rules(rules) {
            angular.extend($scope.$validator.rules, rules);
        };

        scoped.validate = function validate(callback) {
            if (scoped.pending) { scoped.pending.cancel(); }
            scoped.pending = scopeValidator($injector, $scope, this, callback);
        };

        return scoped;
    };

    var scopeValidator = function scopeValidator($injector, $scope, scoped, callback) {
        var sv = {
            callback: callback,
            rules: angular.extend({}, $scope.$validator.rules),
            errors: $scope.$validator.errors,
            cancelled: false,
            remaining: 1,
            isValid: true
        };

        sv.cancel = function cancel() { sv.cancelled = true; };

        for (var key in sv.rules) {
            if (sv.rules.hasOwnProperty(key)) {
                ++sv.remaining;
                var value = $scope.$eval(key);
                (function (key, value) {
                    fieldValidator($injector, $scope, scoped, key, value, function (result, message) {
                        if (sv.cancelled) { return; }
                        if ($scope.$eval(key) !== value) { return; }
                        if (result) {
                            sv.errors[key] = false;
                        }
                        else {
                            sv.errors[key] = message;
                            sv.isValid = false;
                        }
                        if (--sv.remaining === 0) {
                            callback(sv.isValid, sv.errors);
                        }
                    });
                })(key, value);
            }
        }
        if (--sv.remaining === 0) {
            callback(sv.isValid, sv.errors);
        }

        return sv;
    };

    var fieldValidator = function fieldValidator($injector, $scope, scoped, key, value, callback) {
        var rules = [].concat($scope.$validator.rules[key]),
            cursor = 0,
            length = rules.length,
            $cb = function (result, message) {
                if (result) {
                    if (cursor < length) {
                        next(rules);
                    }
                    else {
                        callback(true);
                    }
                }
                else {
                    callback(false, message);
                }
            },
            formatRegex = /\{(.+?)\}/g,
            format = function format(message, context) {
                if (angular.isString(message)) {
                    return message.replace(formatRegex, function (match, key) {
                        return context.hasOwnProperty(key) ? context[key] : match;
                    });
                }
                return message;
            },
            next = function (rules) {
                (function (rule) {
                    if (angular.isString(rule)) {
                        if (scoped.parseExpr) {
                            rule = scoped.parseExpr(rule);
                        }
                        else if (scoped.service.parseExpr) {
                            rule = scoped.service.parseExpr(rule);
                        }
                        else if (scoped.service.provider.parseExpr) {
                            rule = scoped.service.provider.parseExpr(rule);
                        }
                        else {
                            throw 'expressions are not implemented';
                        }
                    }
                    var type = rule.$type;
                    var validator = (
                        (scoped.validators || {})[type] ||
                        (scoped.service.validators || {})[type] ||
                        (scoped.service.provider.validators || {})[type]
                    );
                    if (!validator) {
                        throw 'validator not found: ' + validator;
                    }

                    var context = angular.extend({}, rule),
                        func = validator.$func,
                        fc = angular.extend({}, validator, context),
                        cb = function (result, message) {
                            return $cb(result, format(message, fc));
                        };

                    if (angular.isArray(func) || angular.isArray(func.$inject)) {
                        $injector(func)(value, fc, cb);
                    }
                    else {
                        func(value, fc, cb);
                    }
                })(rules[cursor++]);
            };

        if (length > 0) {
            next(rules);
        }
        else {
            callback(true);
        }
    };

    module.provider('$validator', $validatorProvider);

    module.directive('aqValidationMessage', function aqValidationMessageDirective() {
        return {
            compile: function compile(element, attrs) {
                return function link(scope, element, attrs) {
                    var unwatch = null;
                    attrs.$observe('aqValidationMessage', function (key) {
                        if (unwatch) { unwatch(); }
                        unwatch = scope.$watch(
                            function () {
                                return scope.$validator.errors[key];
                            }, function (message) {
                                if (message === false) {
                                    element.css('display', 'none').html('');
                                }
                                else {
                                    element.text(message).css('display', '');
                                }
                            }
                        );
                    });
                };
            }
        };
    });

    module.directive('aqValidate', function aqValidateDirective() {
        return {
            compile: function compile(element, attrs) {
                return function link(scope, element, attrs) {
                    var unwatch = null;
                    attrs.$observe('ngModel', function (key) {
                        if (unwatch) { unwatch(); }
                        unwatch = scope.$watch(
                            function () {
                                return scope.$validator.errors[key];
                            }, function (message) {
                                if (message === false) {
                                    element.removeClass('error');
                                }
                                else {
                                    element.addClass('error');
                                }
                            }
                        );
                    });
                }
            }
        }
    });
})(angular);
