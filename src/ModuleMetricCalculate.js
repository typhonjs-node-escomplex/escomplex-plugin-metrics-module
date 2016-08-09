import ObjectUtil from 'typhonjs-escomplex-commons/src/utils/ObjectUtil';

/**
 * Provides a typhonjs-escomplex-module / ESComplexModule plugin which gathers and calculates all default metrics.
 *
 * @see https://www.npmjs.com/package/typhonjs-escomplex-commons
 * @see https://www.npmjs.com/package/typhonjs-escomplex-module
 */
export default class ModuleMetricCalculate
{
   /**
    * Coordinates calculating all metrics. All module and class methods are traversed. If there are no module or class
    * methods respectively the aggregate MethodReport is used for calculations.
    *
    * @param {ModuleReport}   moduleReport - The ModuleReport being processed.
    * @param {object}         settings - Settings for module processing.
    *
    * @private
    */
   static calculate(moduleReport, settings)
   {
      let moduleMethodCount = moduleReport.methods.length;
      const moduleMethodAverages = moduleReport.methodAverage;
      const moduleMethodAverageKeys = ObjectUtil.getAccessorList(moduleMethodAverages);

      // Handle module methods.
      moduleReport.methods.forEach((methodReport) =>
      {
         moduleMethodAverageKeys.forEach((averageKey) =>
         {
            ModuleMetricCalculate.calculateCyclomaticDensity(methodReport);
            ModuleMetricCalculate.calculateHalsteadMetrics(methodReport.halstead);

            const targetValue = ObjectUtil.safeAccess(methodReport, averageKey, 0);
            ObjectUtil.safeSet(moduleMethodAverages, averageKey, targetValue, 'add');
         });
      });

      // Handle module class reports.
      moduleReport.classes.forEach((classReport) =>
      {
         const classMethodAverages = classReport.methodAverage;

         let classMethodCount = classReport.methods.length;
         moduleMethodCount += classMethodCount;

         // Process all class methods.
         classReport.methods.forEach((methodReport) =>
         {
            ModuleMetricCalculate.calculateCyclomaticDensity(methodReport);
            ModuleMetricCalculate.calculateHalsteadMetrics(methodReport.halstead);

            moduleMethodAverageKeys.forEach((averageKey) =>
            {
               const targetValue = ObjectUtil.safeAccess(methodReport, averageKey, 0);

               ObjectUtil.safeSet(moduleMethodAverages, averageKey, targetValue, 'add');
               ObjectUtil.safeSet(classMethodAverages, averageKey, targetValue, 'add');
            });
         });

         ModuleMetricCalculate.calculateCyclomaticDensity(classReport.aggregateMethodReport);
         ModuleMetricCalculate.calculateHalsteadMetrics(classReport.aggregateMethodReport.halstead);

         // If there are no class methods use the class aggregate MethodReport.
         if (classMethodCount === 0)
         {
            // Sane handling of classes that contain no methods.
            moduleMethodAverageKeys.forEach((averageKey) =>
            {
               const targetValue = ObjectUtil.safeAccess(classReport.aggregateMethodReport, averageKey, 0);

               ObjectUtil.safeSet(classMethodAverages, averageKey, targetValue, 'add');
            });

            classMethodCount = 1;
         }

         moduleMethodAverageKeys.forEach((averageKey) =>
         {
            ObjectUtil.safeSet(classMethodAverages, averageKey, classMethodCount, 'div');
         });

         ModuleMetricCalculate.calculateMaintainabilityIndex(classReport, settings, classMethodAverages.cyclomatic,
          classMethodAverages.halstead.effort, classMethodAverages.sloc.logical);
      });

      ModuleMetricCalculate.calculateCyclomaticDensity(moduleReport.aggregateMethodReport);
      ModuleMetricCalculate.calculateHalsteadMetrics(moduleReport.aggregateMethodReport.halstead);

      // If there are no module methods use the module aggregate MethodReport.
      if (moduleMethodCount === 0)
      {
         // Sane handling of classes that contain no methods.
         moduleMethodAverageKeys.forEach((averageKey) =>
         {
            const targetValue = ObjectUtil.safeAccess(moduleReport.aggregateMethodReport, averageKey, 0);

            ObjectUtil.safeSet(moduleMethodAverages, averageKey, targetValue, 'add');
         });

         // Sane handling of modules that contain no methods.
         moduleMethodCount = 1;
      }

      moduleMethodAverageKeys.forEach((averageKey) =>
      {
         ObjectUtil.safeSet(moduleMethodAverages, averageKey, moduleMethodCount, 'div');
      });

      ModuleMetricCalculate.calculateMaintainabilityIndex(moduleReport, settings, moduleMethodAverages.cyclomatic,
       moduleMethodAverages.halstead.effort, moduleMethodAverages.sloc.logical);
   }

   /**
    * Calculates cyclomatic density - Proposed as a modification to cyclomatic complexity by Geoffrey K. Gill and
    * Chris F. Kemerer in 1991, this metric simply re-expresses it as a percentage of the logical lines of code. Lower
    * is better.
    *
    * @param {AggregateMethodReport}   report - An AggregateMethodReport to perform calculations on.
    *
    * @private
    */
   static calculateCyclomaticDensity(report)
   {
      report.cyclomaticDensity = report.sloc.logical === 0 ? 0 : (report.cyclomatic / report.sloc.logical) * 100;
   }

   /**
    * Calculates Halstead metrics. In 1977, Maurice Halstead developed a set of metrics which are calculated based on
    * the number of distinct operators, the number of distinct operands, the total number of operators and the total
    * number of operands in each function. This site picks out three Halstead measures in particular: difficulty,
    * volume and effort.
    *
    * @param {HalsteadData}   halstead - A HalsteadData instance to perform calculations on.
    *
    * @see https://en.wikipedia.org/wiki/Halstead_complexity_measures
    *
    * @private
    */
   static calculateHalsteadMetrics(halstead)
   {
      halstead.length = halstead.operators.total + halstead.operands.total;

      /* istanbul ignore if */
      if (halstead.length === 0)
      {
         halstead.reset();
      }
      else
      {
         halstead.vocabulary = halstead.operators.distinct + halstead.operands.distinct;
         halstead.difficulty = (halstead.operators.distinct / 2)
          * (halstead.operands.distinct === 0 ? 1 : halstead.operands.total / halstead.operands.distinct);
         halstead.volume = halstead.length * (Math.log(halstead.vocabulary) / Math.log(2));
         halstead.effort = halstead.difficulty * halstead.volume;
         halstead.bugs = halstead.volume / 3000;
         halstead.time = halstead.effort / 18;
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
    * @param {ClassReport|ModuleReport}   report - A ClassReport or ModuleReport to perform calculations on.
    * @param {object}               settings - Settings for module processing.
    * @param {number}               averageCyclomatic - Average cyclomatic metric across a ClassReport / ModuleReport.
    * @param {number}               averageEffort - Average Halstead effort across a ClassReport / ModuleReport.
    * @param {number}               averageLoc - Average SLOC metric across a ClassReport / ModuleReport.
    *
    * @private
    */
   static calculateMaintainabilityIndex(report, settings, averageCyclomatic, averageEffort, averageLoc)
   {
      /* istanbul ignore if */
      if (averageCyclomatic === 0) { throw new Error('Encountered function with cyclomatic complexity zero!'); }

      report.maintainability =
       171
       - (3.42 * Math.log(averageEffort))
       - (0.23 * Math.log(averageCyclomatic))
       - (16.2 * Math.log(averageLoc));

      /* istanbul ignore if */
      if (report.maintainability > 171) { report.maintainability = 171; }

      /* istanbul ignore if */
      if (settings.newmi) { report.maintainability = Math.max(0, (report.maintainability * 100) / 171); }
   }
}
