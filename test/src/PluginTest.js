import { assert }          from 'chai';
import fs                  from 'fs';

import PluginSyntaxBabylon from 'escomplex-plugin-syntax-babylon/src/PluginSyntaxBabylon';
import ModuleReport        from 'typhonjs-escomplex-commons/src/module/report/ModuleReport';
import ModuleScopeControl  from 'typhonjs-escomplex-commons/src/module/report/control/ModuleScopeControl';

import ASTWalker           from 'typhonjs-ast-walker/src/ASTWalker';

import PluginMetricsModule from '../../src/PluginMetricsModule';

const pluginData =
[
   { name: 'ESM', PluginClass: PluginMetricsModule }
];

pluginData.forEach((plugin) =>
{
   suite(`(${plugin.name}) plugin:`, () =>
   {
      suite('initialize:', () =>
      {
         const instance = new plugin.PluginClass();

         test('plugin was object', () =>
         {
            assert.isObject(instance);
         });

         test('plugin function onConfigure is exported', () =>
         {
            assert.isFunction(instance.onConfigure);
         });

         test('plugin function onEnterNode is exported', () =>
         {
            assert.isFunction(instance.onEnterNode);
         });

         test('plugin function onModuleAverage is exported', () =>
         {
            assert.isFunction(instance.onModuleAverage);
         });

         test('plugin function onModuleCalculate is exported', () =>
         {
            assert.isFunction(instance.onModuleCalculate);
         });

         test('plugin function onModuleCalculate is exported', () =>
         {
            assert.isFunction(instance.onModulePostAverage);
         });

         test('plugin function onModuleScopeCreated is exported', () =>
         {
            assert.isFunction(instance.onModuleScopeCreated);
         });
      });

      suite('method invocation:', () =>
      {
         const instance = new plugin.PluginClass();

         test('plugin throws on empty event data', () =>
         {
            assert.throws(() => { instance.onConfigure(); });
         });

         test('plugin does not throw on proper event data', () =>
         {
            assert.doesNotThrow(() => { instance.onConfigure({ data: { options: {}, settings: {} } }); });
         });

         test('plugin passes back syntax data', () =>
         {
            const event = { data: { options: {}, settings: {} } };
            instance.onConfigure(event);
            assert.strictEqual(event.data.settings.newmi, false);
         });
      });

      suite('module results:', () =>
      {
         const syntaxInstance = new PluginSyntaxBabylon();
         const instance = new plugin.PluginClass();

         const ast = JSON.parse(fs.readFileSync('./test/fixture/espree-estree.json', 'utf8'));
         const reportResults = JSON.parse(fs.readFileSync('./test/fixture/report-results.json', 'utf8'));

         /**
          * Bootstraps the ESComplexModule runtime and fudges traversing the AST with the Babylon trait syntaxes.
          *
          * Note: That the control flow below exactly replicates typhonjs-escomplex-module / ESComplexModule. If there
          * are any future changes to ESComplexModule the below control flow will need to be modified accordingly.
          */
         test('verify calculated results', () =>
         {
            const moduleReport = new ModuleReport(ast.loc.start.line, ast.loc.end.line);
            const scopeControl = new ModuleScopeControl(moduleReport);

            let event = { data: { options: {}, settings: {} } };

            instance.onConfigure(event);
            syntaxInstance.onConfigure(event);

            const settings = event.data.settings;

            event = { data: { settings, syntaxes: {} } };

            syntaxInstance.onLoadSyntax(event);

            const syntaxes = event.data.syntaxes;

            // Completely traverse the provided AST and defer to plugins to process node traversal.
            new ASTWalker().traverse(ast,
            {
               enterNode: (node, parent) =>
               {
                  const syntax = syntaxes[node.type];

                  let ignoreKeys = [];

                  // Process node syntax / ignore keys.
                  if (typeof syntax === 'object')
                  {
                     if (syntax.ignoreKeys)
                     {
                        ignoreKeys = syntax.ignoreKeys.valueOf(node, parent);
                     }
                  }

                  ignoreKeys = instance.onEnterNode(
                   { data: { moduleReport, scopeControl, ignoreKeys, syntaxes, settings, node, parent } });

                  // Process node syntax / create scope.
                  if (typeof syntax === 'object')
                  {
                     if (syntax.ignoreKeys)
                     {
                        ignoreKeys = syntax.ignoreKeys.valueOf(node, parent);
                     }

                     if (syntax.newScope)
                     {
                        const newScope = syntax.newScope.valueOf(node, parent);

                        if (newScope)
                        {
                           scopeControl.createScope(newScope);
                           instance.onModuleScopeCreated({ data: { moduleReport, scopeControl, newScope } });
                        }
                     }
                  }

                  return ignoreKeys;
               },

               exitNode: (node, parent) =>
               {
                  const syntax = syntaxes[node.type];

                  // Process node syntax / pop scope.
                  if (typeof syntax === 'object' && syntax.newScope)
                  {
                     const newScope = syntax.newScope.valueOf(node, parent);

                     if (newScope)
                     {
                        scopeControl.popScope(newScope);
                     }
                  }
               }
            });

            instance.onModuleCalculate({ data: { moduleReport, syntaxes, settings } });
            instance.onModuleAverage({ data: { moduleReport, syntaxes, settings } });
            instance.onModulePostAverage({ data: { moduleReport, syntaxes, settings } });

            moduleReport.finalize();

            assert.strictEqual(JSON.stringify(moduleReport), JSON.stringify(reportResults));
         });
      });
   });
});