#!/usr/bin/env node

const ParcelBundler = require('parcel-bundler')

const [,, target, inputFile, outFilePath] = process.argv
const [outDir, outFile] = outFilePath.split('/')

const minify = process.env.DEV ? false : true;

const bundler = new ParcelBundler(inputFile, {
  target,
  inputFile,
  outFile,
  outDir,
  minify,
  watch: false
})

bundler.bundle()