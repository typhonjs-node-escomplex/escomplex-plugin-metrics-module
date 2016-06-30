'use strict';

import 'babel-polyfill';

import { assert }          from 'chai';
import fs                  from 'fs';

import PluginSyntaxBabylon from 'escomplex-plugin-syntax-babylon/src/PluginSyntaxBabylon';
import ModuleReport        from 'typhonjs-escomplex-commons/src/module/report/ModuleReport';

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

         test('plugin function onExitNode is exported', () =>
         {
            assert.isFunction(instance.onExitNode);
         });

         test('plugin function onModuleEnd is exported', () =>
         {
            assert.isFunction(instance.onModuleEnd);
         });

         test('plugin function onModuleStart is exported', () =>
         {
            assert.isFunction(instance.onModuleStart);
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
          */
         test('verify onModuleEnd results', () =>
         {
            const report = new ModuleReport(ast.loc.start.line, ast.loc.end.line);

            let event = { data: { options: {}, settings: {} } };

            instance.onConfigure(event);
            syntaxInstance.onConfigure(event);

            const settings = event.data.settings;

            event = { data: { settings, syntaxes: {} } };

            syntaxInstance.onLoadSyntax(event);

            const syntaxes = event.data.syntaxes;

            event = { data: { ast, report, settings, syntaxes } };

            instance.onModuleStart(event);

            // Completely traverse the provided AST and defer to plugins to process node traversal.
            new ASTWalker().traverse(ast,
            {
               enterNode: (node, parent) => { return instance.onEnterNode({ data: { report, node, parent } }); },
               exitNode: (node, parent) => { instance.onExitNode({ data: { report, node, parent } }); }
            });

            instance.onModuleEnd({ data: { report } });

            report.finalize();

            assert.strictEqual(JSON.stringify(report), JSON.stringify(reportResults));
         });
      });
   });
});