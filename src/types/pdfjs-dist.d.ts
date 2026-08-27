// pdfjs-dist ships this as a raw build artifact with no type declarations.
// We only ever pass its namespace object through untouched (see
// ensurePdfWorkerReady in pdf-import.ts), so an untyped ambient declaration
// is enough -- no need to model its actual exports.
declare module "pdfjs-dist/build/pdf.worker.min.mjs";
