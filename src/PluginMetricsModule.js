'use strict';

import safeName   from 'typhonjs-escomplex-commons/src/traits/safeName.js';

/**
 * Provides default escomplex metrics gathering and calculation.
 */
export default class PluginMetricsModule
{
   /**
    * Loads any default settings that are not already provided by any user options.
    *
    * @param {object}   ev - escomplex plugin event data.
    */
   onConfigure(ev)
   {
      ev.data.settings.newmi = typeof ev.data.options.newmi === 'boolean' ? ev.data.options.newmi : false;
   }

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

   onExitNode(ev)
   {
      const syntax = this.syntaxes[ev.data.node.type];

      if (syntax !== null && typeof syntax === 'object' && syntax.newScope) { this.popScope(); }
   }

   onModuleEnd()
   {
      this.calculateMetrics(this.settings);
   }

   onModuleStart(ev)
   {
      this.settings = ev.data.settings;
      this.syntaxes = ev.data.syntaxes;
      this.currentReport = undefined;
      this.clearDependencies = true;
      this.scopeStack = [];

      this.report = ev.data.report;

      this.report.aggregate = this.createFunctionReport(undefined, ev.data.ast.loc, 0);
      this.report.functions = [];
      this.report.dependencies = [];
   }

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

   createReport(lines)
   {
      return {
         aggregate: this.createFunctionReport(undefined, lines, 0),
         functions: [],
         dependencies: []
      };
   }

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

   createInitialHalsteadState()
   {
      return {
         operators: this.createInitialHalsteadItemState(),
         operands: this.createInitialHalsteadItemState()
      };
   }

   createInitialHalsteadItemState()
   {
      return {
         distinct: 0,
         total: 0,
         identifiers: []
      };
   }

   processLloc(node, syntax, currentReport)
   {
      this.incrementCounter(node, syntax, 'lloc', this.incrementLogicalSloc, currentReport);
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

   incrementLogicalSloc(currentReport, amount)
   {
      this.report.aggregate.sloc.logical += amount;

      if (currentReport)
      {
         currentReport.sloc.logical += amount;
      }
   }

   processCyclomatic(node, syntax, currentReport)
   {
      this.incrementCounter(node, syntax, 'cyclomatic', this.incrementCyclomatic, currentReport);
   }

   incrementCyclomatic(currentReport, amount)
   {
      this.report.aggregate.cyclomatic += amount;

      if (currentReport)
      {
         currentReport.cyclomatic += amount;
      }
   }

   processOperators(node, parent, syntax, currentReport)
   {
      this.processHalsteadMetric(node, parent, syntax, 'operators', currentReport);
   }

   processOperands(node, parent, syntax, currentReport)
   {
      this.processHalsteadMetric(node, parent, syntax, 'operands', currentReport);
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
                  identifier.forEach((element) =>
                  {
                     this.halsteadItemEncountered(currentReport, metric, element);
                  });
               }
               else
               {
                  this.halsteadItemEncountered(currentReport, metric, identifier);
               }
            }
         });
      }
   }

   halsteadItemEncountered(currentReport, metric, identifier)
   {
      if (currentReport)
      {
         this.incrementHalsteadItems(currentReport, metric, identifier);
      }

      this.incrementHalsteadItems(this.report.aggregate, metric, identifier);
   }

   incrementHalsteadItems(baseReport, metric, identifier)
   {
      this.incrementDistinctHalsteadItems(baseReport, metric, identifier);
      this.incrementTotalHalsteadItems(baseReport, metric);
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

   isHalsteadMetricDistinct(baseReport, metric, identifier)
   {
      return baseReport.halstead[metric].identifiers.indexOf(identifier) === -1;
   }

   recordDistinctHalsteadMetric(baseReport, metric, identifier)
   {
      baseReport.halstead[metric].identifiers.push(identifier);
   }

   incrementHalsteadMetric(baseReport, metric, type)
   {
      if (baseReport)
      {
         baseReport.halstead[metric][type] += 1;
      }
   }

   incrementTotalHalsteadItems(baseReport, metric)
   {
      this.incrementHalsteadMetric(baseReport, metric, 'total');
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

   calculateMetrics(settings)
   {
      let count = this.report.functions.length;

      const indices = {
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

      this.calculateMaintainabilityIndex(averages[indices.effort], averages[indices.cyclomatic], averages[indices.loc],
       settings);

      Object.keys(indices).forEach((index) => { this.report[index] = averages[indices[index]]; });
   }

   calculateCyclomaticDensity(data)
   {
      data.cyclomaticDensity = (data.cyclomatic / data.sloc.logical) * 100;
   }

   calculateHalsteadMetrics(data)
   {
      data.length = data.operators.total + data.operands.total;

      if (data.length === 0)
      {
         this.nilHalsteadMetrics(data);
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

   nilHalsteadMetrics(data)
   {
      data.vocabulary = data.difficulty = data.volume = data.effort = data.bugs = data.time = 0;
   }

   sumMaintainabilityMetrics(sums, indices, data)
   {
      sums[indices.loc] += data.sloc.logical;
      sums[indices.cyclomatic] += data.cyclomatic;
      sums[indices.effort] += data.halstead.effort;
      sums[indices.params] += data.params;
   }

   calculateMaintainabilityIndex(averageEffort, averageCyclomatic, averageLoc, settings)
   {
      if (averageCyclomatic === 0)
      {
         throw new Error('Encountered function with cyclomatic complexity zero!');
      }

      this.report.maintainability =
       171
       - (3.42 * Math.log(averageEffort))
       - (0.23 * Math.log(averageCyclomatic))
       - (16.2 * Math.log(averageLoc));

      if (this.report.maintainability > 171)
      {
         this.report.maintainability = 171;
      }

      if (settings.newmi)
      {
         this.report.maintainability = Math.max(0, (this.report.maintainability * 100) / 171);
      }
   }
}