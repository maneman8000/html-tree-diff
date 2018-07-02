const diff = require("./diff");

const TYPE_ELEMENT = "el";
const TYPE_TEXT = "txt";

class Node {
  constructor(num, tagName, path, attributes = []) {
    this.num = num;
    this.type = TYPE_ELEMENT;
    this.tagName = tagName;
    this.path = [[], []];
    this.path[num] = path;
    this.attributes = attributes;
  }

  eq(node2) {
    if (this.type != node2.type) return false;
    return this.tagName === node2.tagName
      && JSON.stringify(this.attributes) === JSON.stringify(node2.attributes);
  }

  getPath(num) {
    return this.path[num || this.num];
  }
}

class Text {
  constructor(num, text, path) {
    this.num = num;
    this.type = TYPE_TEXT;
    this.text = text;
    this.path = [[], []];
    this.path[num] = path;
  }

  eq(text2) {
    if (this.type != text2.type) return false;
    return this.text === text2.text;
  }

  getPath(num) {
    return this.path[num || this.num];
  }
}

class Nodes {
  constructor(d = []) {
    this.data = d;
  }

  length() {
    return this.data.length;
  }

  at(i) {
    return this.data[i];
  }

  push(n) {
    this.data.push(n);
  }

  forEach(cb) {
    this.data.forEach(cb);
  }

  slice(n1, n2) {
    return new Nodes(this.data.slice(n1, n2));
  }

  findIndex(cb) {
    return this.data.findIndex(cb);
  }

  every(cb) {
    return this.data.every(cb);
  }

  eq(nodes2) {
    if (this.length() !== nodes2.length()) return false;
    return this.every((n1, i) => n1.eq(nodes2.at(i)));
  }

  add(num ,node, path) {
    if (node.tagName) {
      this.push(new Node (
        num,
        node.tagName.toLowerCase(),
        path,
        convertAttributes(node.attributes)
      ));
    }
    else if (node.textContent || node.text) {
      this.push(new Text(
        num,
        node.textContent || node.text,
        path
      ));
    }
  }

  merge(nodes2) {
    if (this.length() !== nodes2.length()) {
      throw "can't merge different length nodes";
    }
    this.forEach((n, i) => {
      const num = n.num === 0 ? 1 : 0;
      n.path[num] = nodes2.at(i).getPath();
    });
    return this;
  }
}

class DiffTree {
  constructor() {
    this.root1 = new TreeNode('html');
    this.root2 = new TreeNode('html');
  }

  walk(node, opt, cb) {
    if (typeof opt === "function") {
      cb = opt;
      opt = {};
    }
    if (!opt.all && node.removed) return;
    cb(node);
    if (node.type === TYPE_ELEMENT) {
      node.children.forEach(c => this.walk(c, opt, cb));
    }
  }

  add(diff, nodeOrText) {
    const parent1 = this.pathLastMatch(this.root1, nodeOrText.getPath(0));
    const parent2 = this.pathLastMatch(this.root2, nodeOrText.getPath(1));
    if (diff === 0) {
      if (!parent1 || !parent2) {
        throw "can't find1: " + JSON.stringify(nodeOrText);
      }
      const n1 = this.appendToNode(parent1, nodeOrText);
      const n2 = this.appendToNode(parent2, nodeOrText);
      n2.link = n1;
    }
    else if (diff === 1) {
      if (!parent2) {
        throw "can't find2: " + JSON.stringify(nodeOrText);
      }
      const n = this.appendToNode(parent2, nodeOrText);
      n.diffs.insert = 1;
    }
    else if (diff === -1) {
      if (!parent1) {
        throw "can't find3: " + JSON.stringify(nodeOrText);
      }
      const n = this.appendToNode(parent1, nodeOrText);
      n.diffs.remove = 1;
      // tree2 の削除された箇所をさかのぼって特定する
      let p2 = this.pathLastMatch(this.root2, nodeOrText.getPath(0));
      let path = nodeOrText.getPath(0).slice(0, nodeOrText.path.length - 1);
      while (!p2 && path.length > 0) {
        p2 = this.pathLastMatch(this.root2, path);
        path = path.slice(0, path.length - 1);
      }
      if (!p2) {
        console.warn("WARNING!: can't locate removed path: ", nodeOrText);
      }
      this.appendToNode(p2, nodeOrText, true);
    }
  }

  appendToNode(node, nodeOrText, removed = false) {
    if (nodeOrText.type === TYPE_ELEMENT) {
      node.children.push(new TreeNode(
        nodeOrText.tagName,
        node,
        nodeOrText.attributes,
        removed
      ));
    }
    else {
      node.children.push(new TreeText(
        nodeOrText.text,
        node,
        removed
      ));
    }
    return node.children[node.children.length - 1];
  }

  pathLastMatch(root, path) {
    let current = root;
    for (let j = 0; j < path.length; j++) {
      const p = path[j];
      const ch = current.children.filter(c => !c.removed);
      const len = ch.length;
      if (len === 0) {
        return null;
      }
      for (let i = len - 1; i >= 0; i--) {
        const c = ch[i];
        if (c.tagName === p) {
          current = c;
          break;
        }
        if (i === 0) {
          return null;
        }
      }
    }
    return current;
  }

  siblingsIncludeRemoved(node, cb) {
    if (node.children.findIndex(n => n.removed) >= 0) {
      cb(node.children);
    }
    node.children.forEach((c) => {
      if (c.type === TYPE_ELEMENT) {
        this.siblingsIncludeRemoved(c, cb);
      }
    });
  }

  resolveChanges() {
    this.siblingsIncludeRemoved(this.root2, (siblings) => {
      const len = siblings.length;
      for (let i = 0; i < len; i++) {
        const n = siblings[i];
        if (n.removed) {
          // find removed chunk
          let j = i + 1;
          while (j < len && siblings[j].removed) {
            j += 1;
          }
          // find inserted chunk
          const insertedNodes = [];
          let k = j;
          while (k < len && siblings[k].isInsert()) {
            insertedNodes.push(siblings[k]);
            k += 1;
          }
          k = i - 1;
          while (k >= 0 && siblings[k].isInsert()) {
            insertedNodes.push(siblings[k]);
            k -= 1;
          }
          if (insertedNodes.length > 0) {
            for (let ii = i; ii < j; ii++) {
              const removed = siblings[ii];
              insertedNodes.forEach((ni) => {
                if (removed.match(ni)) {
                  removed.detecedtNotRemoved = true;
                  delete ni.diffs.insert;
                  if (!removed.eq(ni)) {
                    ni.diffs.change = 1;
                  }
                }
              });
            }
          }
          i = j - 1;
        }
      }
    });
  }

  resolveRemoves() {
    this.walk(this.root2, { all: true }, (n) => {
      if (n.removed && !n.detecedtNotRemoved) {
        n.parent.diffs.remove = 1;
      }
    });
  }

  resolveMoves() {
    this.walk(this.root2, (n) => {
      if (n.link && (n.selector({ withoutInsert: true }) !== n.link.selector({ withoutInsert: true }) ||
                     getAncestorInserted(n))) {
        n.diffs.move = 1;
      }
    });
  }

  diffs() {
    const ret = [];
    this.walk(this.root2, (n) => {
      const sel = n.selector();
      const ani = n.ancestorInserted();
      const diffs = n.getDiffs();
      diffs.forEach((diff) => {
        ret.push({ type: diff, selector: sel, ancestorInserted: ani });
      });
    });
    return ret;
  }

  dump() {
    return this.root1.dump()
      + "\n=========\n\n"
      + this.root2.dump();
  }
}

const getSelector = (node, opt = {}) => {
  let sel = [];
  let n = node;
  while (n.parent) {
    const l = n.parent.children.filter((c) => {
      return c.tagName && c.tagName === n.tagName && !c.removed &&
        (opt.withoutInsert ? !c.isInsert() : true);
    }).length;
    const tn = n.tagName.replace(':', '\\:');
    if (l > 1) {
      const i = n.parent.children.filter((c) => {
        return c.tagName && !c.removed &&
          (opt.withoutInsert ? !c.isInsert() : true);
      }).findIndex(c => c === n);
      sel.push({ n: tn, i: i+1 });
    }
    else {
      sel.push({ n: tn });
    }
    n = n.parent;
  }
  return sel.map((s) => {
    if (s.i) {
      return s.n + ':nth-child(' + s.i + ')';
    }
    else {
      return s.n;
    }
  }).reverse().join(' > ');
};

const getAncestorInserted = (node) => {
  let p = node.parent;
  while(p) {
    if (p.isInsert()) return true;
    p = p.parent;
  }
  return false;
};

class TreeNode {
  constructor(tagName, parent = null, attributes = {}, removed = false) {
    this.type = TYPE_ELEMENT;
    this.tagName = tagName;
    this.parent = parent;
    this.attributes = attributes;
    this.children = [];
    this.diffs = {};
    this.removed = removed;
  }

  eq(n2) {
    return this.match(n2) && JSON.stringify(this.attributes) === JSON.stringify(n2.attributes);
  }

  match(n2) {
    return this.type === n2.type && this.tagName === n2.tagName;
  }

  isInsert() {
    return !!this.diffs.insert;
  }

  getDiffs() {
    if (this.removed) return ["removed"];
    if (this.diffs.change) {
      return ["property"];
    }
    return Object.keys(this.diffs);
  }

  selector(opt = {}) {
    return getSelector(this, opt);
  }

  ancestorInserted() {
    return getAncestorInserted(this);
  }

  dump(indent = '') {
    return indent + '{' + [this.tagName, this.getDiffs().join('|'), JSON.stringify(this.attributes)].join(', ') + "}\n"
      + this.children.map(c => c.dump(indent + '  ')).join('');
  }
}

class TreeText {
  constructor(text, parent = null, removed = false) {
    this.type = TYPE_TEXT;
    this.text = text;
    this.parent = parent;
    this.diffs = {};
    this.removed = removed;
  }

  eq(n2) {
    return this.match(n2) && this.text === n2.text;
  }

  match(n2) {
    return this.type === n2.type;
  }

  isInsert() {
    return !!this.diffs.insert;
  }

  getDiffs() {
    if (this.removed) return ["removed-string"];
    return Object.keys(this.diffs).map(d => d + '-string');
  }

  selector(opt = {}) {
    return getSelector(this.parent, opt);
  }

  ancestorInserted() {
    return getAncestorInserted(this);
  }

  dump(indent = '') {
    return indent + '[TEXT] (' + this.getDiffs().join('|') + ') ' + this.text + "\n";
  }
}

const walk = (node, context, i, cb) => {
  cb(node, context);
  if (node.tagName && node.childNodes.length > 0) {
    const cx = context.concat({ node: node, i: i });
    const len = node.childNodes.length;
    for (let i = 0; i < len; i++) {
      const n = node.childNodes[i];
      if (n.nodeType === 1 || n.nodeType === 3) {
        walk(n, cx, i, cb);
      }
    }
  }
};

// 順番に復元していくことでツリー構造を戻せるはずなのでインデックスは不要
const path = (context) => {
  return context.map((cx) => {
    return cx.node.tagName.toLowerCase();
  });
};

// DOM の NamedNodeMap は扱いづらいので変換する
const convertAttributes = (attributes) => {
  if (attributes.constructor.name === 'NamedNodeMap') {
    const ret = {};
    const len = attributes.length;
    for (let i = 0; i < len; i++) {
      ret[attributes[i].name] = attributes[i].value;
    }
    return ret;
  }
  else {
    return attributes;
  }
};

const treeToNodes = (body, num) => {
  const nodes = new Nodes();
  walk(body, [], 0, (node, context) => {
    nodes.add(num, node, path(context));
  });
  return nodes;
};

const composeTreeDiff = (diffs) => {
  const ret = [];
  const tree = new DiffTree();
  diffs.forEach((diff) => {
    diff[1].forEach(nt => tree.add(diff[0], nt));
  });
  tree.resolveChanges();
  tree.resolveRemoves();
  tree.resolveMoves();
  return tree;
};

const diffTree = (seq1, seq2) => {
  const diffs = diff(seq1, seq2);
  // dump diffs
//  diffs.forEach((diff) => {
//    console.log(JSON.stringify(diff));
//  });
  return composeTreeDiff(diffs);
};

module.exports.treeToNodes = treeToNodes;
module.exports.diffTree = diffTree;
