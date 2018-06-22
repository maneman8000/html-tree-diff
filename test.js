const fs = require("fs");
const util = require("util");
const { parse } = require("node-html-parser");
const { minify } = require("html-minifier");
const diffTree = require('./tree-diff');

const minifyOpt = {
  collapseWhitespace: true
};

const readFile = util.promisify(fs.readFile);

const doFile = async () => {
  try {
    const text1 = await readFile("./js-apply/02.html", 'utf-8');
    const tree1 = parse(minify(text1, minifyOpt)).querySelector('body');
    const text2 = await readFile("./js-apply/02-a.html", 'utf-8');
    const tree2 = parse(minify(text2, minifyOpt)).querySelector('body');
    const diffs = diffTree(tree1, tree2);
    console.log(diffs);
  }
  catch (err) {
    console.log(err);
  }
};

doFile();
