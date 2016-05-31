'use strict';

Object.defineProperty(exports, "__esModule", {
   value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _safeName = require('escomplex-core-commons/dist/traits/safeName.js');

var _safeName2 = _interopRequireDefault(_safeName);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * Provides default escomplex metrics gathering and calculation.
 */

var PluginMetricsModule = function () {
   function PluginMetricsModule() {
      _classCallCheck(this, PluginMetricsModule);
   }

   _createClass(PluginMetricsModule, [{
      key: 'onEnterNode',
      value: function onEnterNode(ev) {
         var syntax = this.syntaxes[ev.data.node.type];

         if (syntax !== null && (typeof syntax === 'undefined' ? 'undefined' : _typeof(syntax)) === 'object') {
            this.processNode(ev.data.node, ev.data.parent, syntax);

            if (syntax.newScope) {
               this.createScope(ev.data.node, ev.data.parent);
            }

            ev.data.ignoreKeys = syntax.ignoreKeys;
         }
      }
   }, {
      key: 'onExitNode',
      value: function onExitNode(ev) {
         var syntax = this.syntaxes[ev.data.node.type];

         if (syntax !== null && (typeof syntax === 'undefined' ? 'undefined' : _typeof(syntax)) === 'object' && syntax.newScope) {
            this.popScope();
         }
      }
   }, {
      key: 'onModuleEnd',
      value: function onModuleEnd(ev) {
         this.calculateMetrics(this.settings);

         ev.data.report = this.report;
      }
   }, {
      key: 'onModuleStart',
      value: function onModuleStart(ev) {
         this.settings = ev.data.settings;
         this.syntaxes = ev.data.syntaxes;
         this.currentReport = undefined;
         this.clearDependencies = true;
         this.scopeStack = [];

         this.report = this.createReport(ev.data.ast.loc);
      }
   }, {
      key: 'processNode',
      value: function processNode(node, parent, syntax) {
         this.processLloc(node, syntax, this.currentReport);
         this.processCyclomatic(node, syntax, this.currentReport);
         this.processOperators(node, parent, syntax, this.currentReport);
         this.processOperands(node, parent, syntax, this.currentReport);

         if (this.processDependencies(node, syntax, this.clearDependencies)) {
            // HACK: This will fail with async or if other syntax than CallExpression introduces dependencies.
            // TODO: Come up with a less crude approach.
            this.clearDependencies = false;
         }
      }
   }, {
      key: 'createScope',
      value: function createScope(node, parent) {
         // ESTree has a parent node which defines the method name with a child FunctionExpression / FunctionDeclaration.
         // Babylon AST only has ClassMethod with a child `key` providing the method name.
         var name = parent && parent.type === 'MethodDefinition' ? (0, _safeName2.default)(parent.key) : (0, _safeName2.default)(node.id || node.key);

         this.currentReport = this.createFunctionReport(name, node.loc, node.params.length);

         this.report.functions.push(this.currentReport);
         this.report.aggregate.params += node.params.length;

         this.scopeStack.push(this.currentReport);
      }
   }, {
      key: 'popScope',
      value: function popScope() {
         this.scopeStack.pop();

         if (this.scopeStack.length > 0) {
            this.currentReport = this.scopeStack[this.scopeStack.length - 1];
         } else {
            this.currentReport = undefined;
         }
      }
   }, {
      key: 'createReport',
      value: function createReport(lines) {
         return {
            aggregate: this.createFunctionReport(undefined, lines, 0),
            functions: [],
            dependencies: []
         };
      }
   }, {
      key: 'createFunctionReport',
      value: function createFunctionReport(name, lines, params) {
         var result = {
            name: name,
            sloc: {
               logical: 0
            },
            cyclomatic: 1,
            halstead: this.createInitialHalsteadState(),
            params: params
         };

         if ((typeof lines === 'undefined' ? 'undefined' : _typeof(lines)) === 'object') {
            result.line = lines.start.line;
            result.sloc.physical = lines.end.line - lines.start.line + 1;
         }

         return result;
      }
   }, {
      key: 'createInitialHalsteadState',
      value: function createInitialHalsteadState() {
         return {
            operators: this.createInitialHalsteadItemState(),
            operands: this.createInitialHalsteadItemState()
         };
      }
   }, {
      key: 'createInitialHalsteadItemState',
      value: function createInitialHalsteadItemState() {
         return {
            distinct: 0,
            total: 0,
            identifiers: []
         };
      }
   }, {
      key: 'processLloc',
      value: function processLloc(node, syntax, currentReport) {
         this.incrementCounter(node, syntax, 'lloc', this.incrementLogicalSloc, currentReport);
      }
   }, {
      key: 'incrementCounter',
      value: function incrementCounter(node, syntax, name, incrementFn, currentReport) {
         var amount = syntax[name];

         if (typeof amount === 'number') {
            incrementFn.call(this, currentReport, amount);
         } else if (typeof amount === 'function') {
            incrementFn.call(this, currentReport, amount(node));
         }
      }
   }, {
      key: 'incrementLogicalSloc',
      value: function incrementLogicalSloc(currentReport, amount) {
         this.report.aggregate.sloc.logical += amount;

         if (currentReport) {
            currentReport.sloc.logical += amount;
         }
      }
   }, {
      key: 'processCyclomatic',
      value: function processCyclomatic(node, syntax, currentReport) {
         this.incrementCounter(node, syntax, 'cyclomatic', this.incrementCyclomatic, currentReport);
      }
   }, {
      key: 'incrementCyclomatic',
      value: function incrementCyclomatic(currentReport, amount) {
         this.report.aggregate.cyclomatic += amount;

         if (currentReport) {
            currentReport.cyclomatic += amount;
         }
      }
   }, {
      key: 'processOperators',
      value: function processOperators(node, parent, syntax, currentReport) {
         this.processHalsteadMetric(node, parent, syntax, 'operators', currentReport);
      }
   }, {
      key: 'processOperands',
      value: function processOperands(node, parent, syntax, currentReport) {
         this.processHalsteadMetric(node, parent, syntax, 'operands', currentReport);
      }
   }, {
      key: 'processHalsteadMetric',
      value: function processHalsteadMetric(node, parent, syntax, metric, currentReport) {
         var _this = this;

         if (Array.isArray(syntax[metric])) {
            syntax[metric].forEach(function (s) {
               var identifier = void 0;

               if (typeof s.identifier === 'function') {
                  identifier = s.identifier(node, parent);
               } else {
                  identifier = s.identifier;
               }

               if (typeof identifier !== 'undefined' && (typeof s.filter !== 'function' || s.filter(node) === true)) {
                  // Handle the case when a node / syntax returns an array of identifiers.
                  if (Array.isArray(identifier)) {
                     identifier.forEach(function (element) {
                        _this.halsteadItemEncountered(currentReport, metric, element);
                     });
                  } else {
                     _this.halsteadItemEncountered(currentReport, metric, identifier);
                  }
               }
            });
         }
      }
   }, {
      key: 'halsteadItemEncountered',
      value: function halsteadItemEncountered(currentReport, metric, identifier) {
         if (currentReport) {
            this.incrementHalsteadItems(currentReport, metric, identifier);
         }

         this.incrementHalsteadItems(this.report.aggregate, metric, identifier);
      }
   }, {
      key: 'incrementHalsteadItems',
      value: function incrementHalsteadItems(baseReport, metric, identifier) {
         this.incrementDistinctHalsteadItems(baseReport, metric, identifier);
         this.incrementTotalHalsteadItems(baseReport, metric);
      }
   }, {
      key: 'incrementDistinctHalsteadItems',
      value: function incrementDistinctHalsteadItems(baseReport, metric, identifier) {
         if (Object.prototype.hasOwnProperty(identifier)) {
            // Avoid clashes with built-in property names.
            this.incrementDistinctHalsteadItems(baseReport, metric, '_' + identifier);
         } else if (this.isHalsteadMetricDistinct(baseReport, metric, identifier)) {
            this.recordDistinctHalsteadMetric(baseReport, metric, identifier);
            this.incrementHalsteadMetric(baseReport, metric, 'distinct');
         }
      }
   }, {
      key: 'isHalsteadMetricDistinct',
      value: function isHalsteadMetricDistinct(baseReport, metric, identifier) {
         return baseReport.halstead[metric].identifiers.indexOf(identifier) === -1;
      }
   }, {
      key: 'recordDistinctHalsteadMetric',
      value: function recordDistinctHalsteadMetric(baseReport, metric, identifier) {
         baseReport.halstead[metric].identifiers.push(identifier);
      }
   }, {
      key: 'incrementHalsteadMetric',
      value: function incrementHalsteadMetric(baseReport, metric, type) {
         if (baseReport) {
            baseReport.halstead[metric][type] += 1;
         }
      }
   }, {
      key: 'incrementTotalHalsteadItems',
      value: function incrementTotalHalsteadItems(baseReport, metric) {
         this.incrementHalsteadMetric(baseReport, metric, 'total');
      }
   }, {
      key: 'processDependencies',
      value: function processDependencies(node, syntax, clearDependencies) {
         var dependencies = void 0;

         if (typeof syntax.dependencies === 'function') {
            dependencies = syntax.dependencies(node, clearDependencies);
            if ((typeof dependencies === 'undefined' ? 'undefined' : _typeof(dependencies)) === 'object' || Array.isArray(dependencies)) {
               this.report.dependencies = this.report.dependencies.concat(dependencies);
            }

            return true;
         }

         return false;
      }
   }, {
      key: 'calculateMetrics',
      value: function calculateMetrics(settings) {
         var _this2 = this;

         var count = this.report.functions.length;

         var indices = {
            loc: 0,
            cyclomatic: 1,
            effort: 2,
            params: 3
         };

         var sums = [0, 0, 0, 0];

         this.report.functions.forEach(function (functionReport) {
            _this2.calculateCyclomaticDensity(functionReport);
            _this2.calculateHalsteadMetrics(functionReport.halstead);
            _this2.sumMaintainabilityMetrics(sums, indices, functionReport);
         });

         this.calculateCyclomaticDensity(this.report.aggregate);
         this.calculateHalsteadMetrics(this.report.aggregate.halstead);

         if (count === 0) {
            // Sane handling of modules that contain no functions.
            this.sumMaintainabilityMetrics(sums, indices, this.report.aggregate);
            count = 1;
         }

         var averages = sums.map(function (sum) {
            return sum / count;
         });

         this.calculateMaintainabilityIndex(averages[indices.effort], averages[indices.cyclomatic], averages[indices.loc], settings);

         Object.keys(indices).forEach(function (index) {
            _this2.report[index] = averages[indices[index]];
         });
      }
   }, {
      key: 'calculateCyclomaticDensity',
      value: function calculateCyclomaticDensity(data) {
         data.cyclomaticDensity = data.cyclomatic / data.sloc.logical * 100;
      }
   }, {
      key: 'calculateHalsteadMetrics',
      value: function calculateHalsteadMetrics(data) {
         data.length = data.operators.total + data.operands.total;

         if (data.length === 0) {
            this.nilHalsteadMetrics(data);
         } else {
            data.vocabulary = data.operators.distinct + data.operands.distinct;
            data.difficulty = data.operators.distinct / 2 * (data.operands.distinct === 0 ? 1 : data.operands.total / data.operands.distinct);
            data.volume = data.length * (Math.log(data.vocabulary) / Math.log(2));
            data.effort = data.difficulty * data.volume;
            data.bugs = data.volume / 3000;
            data.time = data.effort / 18;
         }
      }
   }, {
      key: 'nilHalsteadMetrics',
      value: function nilHalsteadMetrics(data) {
         data.vocabulary = data.difficulty = data.volume = data.effort = data.bugs = data.time = 0;
      }
   }, {
      key: 'sumMaintainabilityMetrics',
      value: function sumMaintainabilityMetrics(sums, indices, data) {
         sums[indices.loc] += data.sloc.logical;
         sums[indices.cyclomatic] += data.cyclomatic;
         sums[indices.effort] += data.halstead.effort;
         sums[indices.params] += data.params;
      }
   }, {
      key: 'calculateMaintainabilityIndex',
      value: function calculateMaintainabilityIndex(averageEffort, averageCyclomatic, averageLoc, settings) {
         if (averageCyclomatic === 0) {
            throw new Error('Encountered function with cyclomatic complexity zero!');
         }

         this.report.maintainability = 171 - 3.42 * Math.log(averageEffort) - 0.23 * Math.log(averageCyclomatic) - 16.2 * Math.log(averageLoc);

         if (this.report.maintainability > 171) {
            this.report.maintainability = 171;
         }

         if (settings.newmi) {
            this.report.maintainability = Math.max(0, this.report.maintainability * 100 / 171);
         }
      }
   }]);

   return PluginMetricsModule;
}();

exports.default = PluginMetricsModule;
module.exports = exports['default'];