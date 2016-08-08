import ModuleMetricCalculate  from './ModuleMetricCalculate';
import ModuleMetricControl    from './ModuleMetricControl';

/**
 * Provides a typhonjs-escomplex-module / ESComplexModule plugin which gathers and calculates all default metrics.
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
    * loaded trait syntax.
    *
    * @param {object}   ev - escomplex plugin event data.
    */
   onEnterNode(ev)
   {
      const report = ev.data.report;
      const scopeControl = ev.data.scopeControl;
      const node = ev.data.node;
      const parent = ev.data.parent;
      const syntax = ev.data.syntaxes[node.type];

      // Process node syntax.
      if (typeof syntax === 'object') { ModuleMetricControl.processSyntax(report, scopeControl, syntax, node, parent); }
   }

   /**
    * Performs final calculations based on collected report data.
    *
    * @param {object}   ev - escomplex plugin event data.
    */
   onModuleEnd(ev)
   {
      ModuleMetricCalculate.calculateMetrics(ev.data.report, ev.data.settings);
   }

   /**
    * A new module report scope has been created. Update any associated metrics regarding the new scope.
    *
    * @param {object}   ev - escomplex plugin event data.
    */
   onScopeCreated(ev)
   {
      const report = ev.data.report;
      const scopeControl = ev.data.scopeControl;
      const newScope = ev.data.newScope;

      ModuleMetricControl.createScope(report, scopeControl, newScope);
   }
}
