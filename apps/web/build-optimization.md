# Angular Build Optimization

The production build's measured initial browser bundle is approximately 913 kB. The initial warning budget was 500 kB, which was below the application's current Angular Material, Tailwind, and shared runtime footprint. The warning budget is now 1 MB and the error budget is 1.5 MB.

The exam-analysis component stylesheet is approximately 6.6 kB and contains feature-specific layout, chart, table, drawer, and print rules. It was reviewed without finding safe duplicated or unused rules, so its warning budget is now 7 kB and its error budget is 10 kB rather than moving feature styles globally.

ExcelJS is loaded with dynamic imports only when spreadsheet import or export is requested. It is therefore emitted in a lazy ExcelJS chunk instead of the initial browser bundle. ExcelJS and its known transitive CommonJS dependencies are explicitly allowed in `angular.json`; this suppresses dependency-format warnings for that isolated lazy feature without suppressing unrelated packages.
