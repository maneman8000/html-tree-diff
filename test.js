const fs = require("fs");
const util = require("util");
const { parse } = require("node-html-parser");
const { minify } = require("html-minifier");
const { treeToNodes, diffTree } = require('./tree-diff');

const minifyOpt = {
  collapseWhitespace: true
};

const readFile = util.promisify(fs.readFile);

const files = [
  "./js-apply/02.html", "./js-apply/02-a.html"
]

const doFile = async () => {
  try {
    const text1 = await readFile(files[0], 'utf-8');
    const tree1 = parse(minify(text1, minifyOpt)).querySelector('body');
    const text2 = await readFile(files[1], 'utf-8');
    const tree2 = parse(minify(text2, minifyOpt)).querySelector('body');
    const tree = diffTree(treeToNodes(tree1, 0), treeToNodes(tree2, 1));
    console.log(tree.diffs());
  }
  catch (err) {
    console.log(err);
  }
};

doFile();
