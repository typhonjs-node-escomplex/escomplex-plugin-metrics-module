'use strict';

import safeName   from 'typhonjs-escomplex-commons/src/traits/safeName.js';

/**
 * Provides an typhonjs-escomplex-module / ESComplexModule plugin which gathers and calculates all default metrics.
 *
 * @see https://www.npmjs.com/package/typhonjs-escomplex-commons
 * @see https://www.npmjs.com/package/typhonjs-escomplex-module
 */
export default class PluginMetricsModule
{
   // ESComplexModule plugin callbacks ------------------------------------------------------------------------------

   /**
    * Loads any default settings that are not already provided by any user options.
    *
    * @param {object}   ev - escomplex plugin event data.
    *
    * The following options are:
    * ```
    * (boolean)   newmi - Boolean indicating whether the maintainability index should be rebased on a scale from
    *                     0 to 100; defaults to false.
    * ```
    */
   onConfigure(ev)
   {
      ev.data.settings.newmi = typeof ev.data.options.newmi === 'boolean' ? ev.data.options.newmi : false;
   }

   /**
    * During AST traversal when a node is entered it is processed immediately if the node type corresponds to a
    * loaded trait syntax. Any new report scopes are handled in `onEnterNode`.
    *
    * @param {object}   ev - escomplex plugin event data.
    */
   onEnterNode(ev)
   {
      const syntax = this.syntaxes[ev.data.node.type];

      if (syntax !== null && typeof syntax === 'object')
      {
         this.processNode(ev.data.node, ev.data.parent, syntax);

         if (syntax.newScope) { this.createScope(ev.data.node, ev.data.parent); }

         ev.data.ignoreKeys = syntax.ignoreKeys;
      }
   }

   /**
    * During AST traversal when a node is exited it is processed immediately if the node type corresponds to a
    * loaded trait syntax. If a node has a new report scope it is popped in `onExitNode`.
    *
    * @param {object}   ev - escomplex plugin event data.
    */
   onExitNode(ev)
   {
      const syntax = this.syntaxes[ev.data.node.type];

      if (syntax !== null && typeof syntax === 'object' && syntax.newScope) { this.popScope(); }
   }

   /**
    * Performs final calculations based on collected report data.
    */
   onModuleEnd()
   {
      this.calculateMetrics();
   }

   /**
    * Stores settings and syntaxes, initializes local variables and creates the initial aggregate report.
    *
    * @param {object}   ev - escomplex plugin event data.
    */
   onModuleStart(ev)
   {
      /**
       * Stores the settings for all ESComplexModule plugins.
       * @type {object}
       */
      this.settings = ev.data.settings;

      /**
       * Stores the trait syntaxes loaded by other ESComplexModule plugins.
       * @type {object}
       */
      this.syntaxes = ev.data.syntaxes;

      /**
       * Stores the current report being processed.
       * @type {object}
       */
      this.currentReport = undefined;

      /**
       * Used in tracking dependencies.
       * @type {boolean}
       */
      this.clearDependencies = true;

      /**
       * Stores the current report scope stack.
       * @type {Array}
       */
      this.scopeStack = [];

      /**
       * Stores the global report being processed by ESComplexModule.
       * @type {object}
       */
      this.report = ev.data.report;

      // Creates the default report
      this.report.aggregate = this.createFunctionReport(undefined, ev.data.ast.loc, 0);
      this.report.functions = [];
      this.report.dependencies = [];
   }

   // Module metrics calculation ------------------------------------------------------------------------------------

   /**
    * Calculates cyclomatic density - Proposed as a modification to cyclomatic complexity by Geoffrey K. Gill and
    * Chris F. Kemerer in 1991, this metric simply re-expresses it as a percentage of the logical lines of code. Lower
    * is better.
    *
    * @param {object}   data -
    */
   calculateCyclomaticDensity(data)
   {
      data.cyclomaticDensity = (data.cyclomatic / data.sloc.logical) * 100;
   }

   /**
    * Calculates Halstead metrics. In 1977, Maurice Halstead developed a set of metrics which are calculated based on
    * the number of distinct operators, the number of distinct operands, the total number of operators and the total
    * number of operands in each function. This site picks out three Halstead measures in particular: difficulty,
    * volume and effort.
    *
    * @param {object}   data -
    *
    * @see https://en.wikipedia.org/wiki/Halstead_complexity_measures
    */
   calculateHalsteadMetrics(data)
   {
      data.length = data.operators.total + data.operands.total;

      if (data.length === 0)
      {
         data.vocabulary = data.difficulty = data.volume = data.effort = data.bugs = data.time = 0;
      }
      else
      {
         data.vocabulary = data.operators.distinct + data.operands.distinct;
         data.difficulty = (data.operators.distinct / 2)
          * (data.operands.distinct === 0 ? 1 : data.operands.total / data.operands.distinct);
         data.volume = data.length * (Math.log(data.vocabulary) / Math.log(2));
         data.effort = data.difficulty * data.volume;
         data.bugs = data.volume / 3000;
         data.time = data.effort / 18;
      }
   }

   /**
    * Designed in 1991 by Paul Oman and Jack Hagemeister at the University of Idaho, this metric is calculated at the
    * whole program or module level from averages of the other 3 metrics, using the following formula:
    * ```
    * 171 -
    * (3.42 * ln(mean effort)) -
    * (0.23 * ln(mean cyclomatic complexity)) -
    * (16.2 * ln(mean logical LOC))
    * ```
    * Values are on a logarithmic scale ranging from negative infinity up to 171, with greater numbers indicating a
    * higher level of maintainability. In their original paper, Oman and Hagemeister identified 65 as the threshold
    * value below which a program should be considered difficult to maintain.
    *
    * @param {number}   averageEffort -
    * @param {number}   averageCyclomatic -
    * @param {number}   averageLoc -
    */
   calculateMaintainabilityIndex(averageEffort, averageCyclomatic, averageLoc)
   {
      if (averageCyclomatic === 0) { throw new Error('Encountered function with cyclomatic complexity zero!'); }

      this.report.maintainability =
       171
       - (3.42 * Math.log(averageEffort))
       - (0.23 * Math.log(averageCyclomatic))
       - (16.2 * Math.log(averageLoc));

      if (this.report.maintainability > 171) { this.report.maintainability = 171; }

      if (this.settings.newmi) { this.report.maintainability = Math.max(0, (this.report.maintainability * 100) / 171); }
   }

   /**
    * Coordinates calculating all metrics.
    */
   calculateMetrics()
   {
      let count = this.report.functions.length;

      const indices =
      {
         loc: 0,
         cyclomatic: 1,
         effort: 2,
         params: 3
      };

      const sums = [0, 0, 0, 0];

      this.report.functions.forEach((functionReport) =>
      {
         this.calculateCyclomaticDensity(functionReport);
         this.calculateHalsteadMetrics(functionReport.halstead);
         this.sumMaintainabilityMetrics(sums, indices, functionReport);
      });

      this.calculateCyclomaticDensity(this.report.aggregate);
      this.calculateHalsteadMetrics(this.report.aggregate.halstead);

      if (count === 0)
      {
         // Sane handling of modules that contain no functions.
         this.sumMaintainabilityMetrics(sums, indices, this.report.aggregate);
         count = 1;
      }

      const averages = sums.map((sum) => { return sum / count; });

      this.calculateMaintainabilityIndex(averages[indices.effort], averages[indices.cyclomatic], averages[indices.loc]);

      Object.keys(indices).forEach((index) => { this.report[index] = averages[indices[index]]; });
   }

   /**
    * Creates a new function report.
    *
    * @param {string}   name - Name of the function.
    * @param {number}   lines - Number of lines for the function.
    * @param {number}   params - Number of parameters for function.
    *
    * @returns {object}
    */
   createFunctionReport(name, lines, params)
   {
      const result = {
         name,
         sloc: {
            logical: 0
         },
         cyclomatic: 1,
         halstead: this.createInitialHalsteadState(),
         params
      };

      if (typeof lines === 'object')
      {
         result.line = lines.start.line;
         result.sloc.physical = lines.end.line - lines.start.line + 1;
      }

      return result;
   }

   /**
    * Creates an object hash representing Halstead state.
    *
    * @returns {{operators: {distinct: number, total: number, identifiers: Array}, operands: {distinct: number, total: number, identifiers: Array}}}
    */
   createInitialHalsteadState()
   {
      return {
         operators: { distinct: 0, total: 0, identifiers: [] },
         operands: { distinct: 0, total: 0, identifiers: [] }
      };
   }

   /**
    * Creates a report scope when a class or function is entered.
    *
    * @param {object}   node - Current AST node.
    * @param {object}   parent - Parent AST node.
    */
   createScope(node, parent)
   {
      // ESTree has a parent node which defines the method name with a child FunctionExpression / FunctionDeclaration.
      // Babylon AST only has ClassMethod with a child `key` providing the method name.
      const name = parent && parent.type === 'MethodDefinition' ? safeName(parent.key) : safeName(node.id || node.key);

      this.currentReport = this.createFunctionReport(name, node.loc, node.params.length);

      this.report.functions.push(this.currentReport);
      this.report.aggregate.params += node.params.length;

      this.scopeStack.push(this.currentReport);
   }

   halsteadItemEncountered(currentReport, metric, identifier)
   {
      if (currentReport) { this.incrementHalsteadItems(currentReport, metric, identifier); }

      this.incrementHalsteadItems(this.report.aggregate, metric, identifier);
   }

   incrementCounter(node, syntax, name, incrementFn, currentReport)
   {
      const amount = syntax[name];

      if (typeof amount === 'number')
      {
         incrementFn.call(this, currentReport, amount);
      }
      else if (typeof amount === 'function')
      {
         incrementFn.call(this, currentReport, amount(node));
      }
   }

   incrementCyclomatic(currentReport, amount)
   {
      this.report.aggregate.cyclomatic += amount;

      if (currentReport)
      {
         currentReport.cyclomatic += amount;
      }
   }

   incrementDistinctHalsteadItems(baseReport, metric, identifier)
   {
      if (Object.prototype.hasOwnProperty(identifier))
      {
         // Avoid clashes with built-in property names.
         this.incrementDistinctHalsteadItems(baseReport, metric, `_${identifier}`);
      }
      else if (this.isHalsteadMetricDistinct(baseReport, metric, identifier))
      {
         this.recordDistinctHalsteadMetric(baseReport, metric, identifier);
         this.incrementHalsteadMetric(baseReport, metric, 'distinct');
      }
   }

   incrementHalsteadItems(baseReport, metric, identifier)
   {
      this.incrementDistinctHalsteadItems(baseReport, metric, identifier);
      this.incrementTotalHalsteadItems(baseReport, metric);
   }

   incrementHalsteadMetric(baseReport, metric, type)
   {
      if (baseReport)
      {
         baseReport.halstead[metric][type] += 1;
      }
   }

   incrementLogicalSloc(currentReport, amount)
   {
      this.report.aggregate.sloc.logical += amount;

      if (currentReport)
      {
         currentReport.sloc.logical += amount;
      }
   }

   incrementTotalHalsteadItems(baseReport, metric)
   {
      this.incrementHalsteadMetric(baseReport, metric, 'total');
   }

   isHalsteadMetricDistinct(baseReport, metric, identifier)
   {
      return baseReport.halstead[metric].identifiers.indexOf(identifier) === -1;
   }

   popScope()
   {
      this.scopeStack.pop();

      if (this.scopeStack.length > 0)
      {
         this.currentReport = this.scopeStack[this.scopeStack.length - 1];
      }
      else
      {
         this.currentReport = undefined;
      }
   }

   processCyclomatic(node, syntax, currentReport)
   {
      this.incrementCounter(node, syntax, 'cyclomatic', this.incrementCyclomatic, currentReport);
   }

   processDependencies(node, syntax, clearDependencies)
   {
      let dependencies;

      if (typeof syntax.dependencies === 'function')
      {
         dependencies = syntax.dependencies(node, clearDependencies);
         if (typeof dependencies === 'object' || Array.isArray(dependencies))
         {
            this.report.dependencies = this.report.dependencies.concat(dependencies);
         }

         return true;
      }

      return false;
   }

   processHalsteadMetric(node, parent, syntax, metric, currentReport)
   {
      if (Array.isArray(syntax[metric]))
      {
         syntax[metric].forEach((s) =>
         {
            let identifier;

            if (typeof s.identifier === 'function')
            {
               identifier = s.identifier(node, parent);
            }
            else
            {
               identifier = s.identifier;
            }

            if (typeof identifier !== 'undefined' && (typeof s.filter !== 'function' || s.filter(node) === true))
            {
               // Handle the case when a node / syntax returns an array of identifiers.
               if (Array.isArray(identifier))
               {
                  identifier.forEach((element) => { this.halsteadItemEncountered(currentReport, metric, element); });
               }
               else
               {
                  this.halsteadItemEncountered(currentReport, metric, identifier);
               }
            }
         });
      }
   }

   processLloc(node, syntax, currentReport)
   {
      this.incrementCounter(node, syntax, 'lloc', this.incrementLogicalSloc, currentReport);
   }

   /**
    * Controls processing an AST node.
    *
    * @param {object}   node - Current AST node.
    * @param {object}   parent - Parent AST node.
    * @param {object}   syntax - Syntax trait associated with the give node type.
    */
   processNode(node, parent, syntax)
   {
      this.processLloc(node, syntax, this.currentReport);
      this.processCyclomatic(node, syntax, this.currentReport);
      this.processOperators(node, parent, syntax, this.currentReport);
      this.processOperands(node, parent, syntax, this.currentReport);

      if (this.processDependencies(node, syntax, this.clearDependencies))
      {
         // HACK: This will fail with async or if other syntax than CallExpression introduces dependencies.
         // TODO: Come up with a less crude approach.
         this.clearDependencies = false;
      }
   }

   processOperands(node, parent, syntax, currentReport)
   {
      this.processHalsteadMetric(node, parent, syntax, 'operands', currentReport);
   }

   processOperators(node, parent, syntax, currentReport)
   {
      this.processHalsteadMetric(node, parent, syntax, 'operators', currentReport);
   }

   recordDistinctHalsteadMetric(baseReport, metric, identifier)
   {
      baseReport.halstead[metric].identifiers.push(identifier);
   }

   sumMaintainabilityMetrics(sums, indices, data)
   {
      sums[indices.loc] += data.sloc.logical;
      sums[indices.cyclomatic] += data.cyclomatic;
      sums[indices.effort] += data.halstead.effort;
      sums[indices.params] += data.params;
   }
}