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

class Nodes extends Array {
  eq(nodes2) {
    if (this.length !== nodes2.length) return false;
    return this.every((n1, i) => n1.eq(nodes2[i]));
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
    if (this.length !== nodes2.length) {
      throw "can't merge different length nodes";
    }
    this.forEach((n, i) => {
      const num = n.num === 0 ? 1 : 0;
      n.path[num] = nodes2[i].getPath();
    });
    return this;
  }
}

class DiffTree {
  constructor() {
    this.root1 = new TreeNode('html');
    this.root2 = new TreeNode('html');
  }

  walk(node, cb) {
    cb(node);
    if (node.type === TYPE_ELEMENT) {
      node.children.forEach(c => this.walk(c, cb));
    }
  }

  add(diff, nodeOrText) {
    const parent1 = this.pathLastMatch(this.root1, nodeOrText.getPath(0));
    const parent2 = this.pathLastMatch(this.root2, nodeOrText.getPath(1));
    if (diff === 0) {
      if (!parent1 || !parent2) {
        throw "can't find1: " + JSON.stringify(nodeOrText);
      }
      this.appendToNode(parent1, nodeOrText);
      this.appendToNode(parent2, nodeOrText);
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
      // tree2 の削除された箇所をさかのぼって特定する (遡る必要ないかも?)
      let p2 = parent2;
      let path = nodeOrText.getPath(1).slice(0, nodeOrText.path.length - 1);
      while (!p2 && path.length > 0) {
        p2 = this.pathLastMatch(this.root2, path);
        path = path.slice(0, path.length - 1);
      }
      if (!p2) {
        console.warn("WARNING!: can't locate removed path: ", nodeOrText);
      }
      p2.removedNodes.push(n);
    }
  }

  appendToNode(node, nodeOrText) {
    if (nodeOrText.type === TYPE_ELEMENT) {
      node.children.push(new TreeNode(
        nodeOrText.tagName,
        node,
        nodeOrText.attributes
      ));
    }
    else {
      node.children.push(new TreeText(
        nodeOrText.text,
        node
      ));
    }
    return node.children[node.children.length - 1];
  }

  pathLastMatch(root, path) {
    let current = root;
    for (let j = 0; j < path.length; j++) {
      const p = path[j];
      const len = current.children.length;
      if (len === 0) {
        return null;
      }
      for (let i = len - 1; i >= 0; i--) {
        const c = current.children[i];
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

  fixDiffs() {
    this.walk(this.root2, (nodeOrText) => {
      if (nodeOrText.type === TYPE_ELEMENT && nodeOrText.removedNodes.length > 0) {
        let removed = true;
        nodeOrText.removedNodes.forEach((rn) => {
          nodeOrText.children.forEach((n) => {
            if (n.diffs.insert && n.match(rn)) {
              n.changed(rn);
              removed = false;
              return; // break
            }
          });
        });
        if (removed) {
          nodeOrText.diffs.remove = 1;
        }
      }
    });
  }

  diffs() {
    const ret = [];
    this.walk(this.root2, (n) => {
      if (Object.keys(n.diffs).length > 0) {
        const sel = n.selector();
        for (let type in n.diffs) {
          if (n.type === TYPE_ELEMENT) {
            ret.push({ type: type, selector: sel });
          }
          else {
            ret.push({ type: type + '-string', selector: sel });
          }
        }
      }
    });
    return ret;
  }

  dump() {
    return this.root1.dump()
      + "\n=========\n\n"
      + this.root2.dump();
  }
}

const getSelector = (node) => {
  let sel = [];
  let n = node;
  while (n.parent) {
    const l = n.parent.children.filter(c => c.tagName && c.tagName === n.tagName).length;
    if (l > 1) {
      const i = n.parent.children.filter(c => c.tagName).findIndex(c => c === n);
      sel.push({ n: n.tagName, i: i+1 });
    }
    else {
      sel.push({ n: n.tagName });
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

class TreeNode {
  constructor(tagName, parent = null, attributes = {}) {
    this.type = TYPE_ELEMENT;
    this.tagName = tagName;
    this.parent = parent;
    this.attributes = attributes;
    this.children = [];
    this.diffs = {};
    this.removedNodes = [];
  }

  match(n2) {
    return this.type === n2.type && this.tagName === n2.tagName;
  }

  changed(n2) {
    this.diffs.property = 1;
  }

  diff() {
    return Object.keys(this.diffs).join("|");
  }

  selector() {
    return getSelector(this);
  }

  dump(indent = '') {
    return indent + '{' + [this.tagName, this.diff(), JSON.stringify(this.attributes)].join(', ') + "}\n"
      + this.children.map(c => c.dump(indent + '  ')).join('');
  }
}

class TreeText {
  constructor(text, parent = null) {
    this.type = TYPE_TEXT;
    this.text = text;
    this.parent = parent;
    this.diffs = {};
  }

  match(n2) {
    return this.type === n2.type;
  }

  changed(n2) {
    // TODO: ここでさらに詳細な text diff を取れる
    this.diffs['changed'] = 1;
  }

  diff() {
    return Object.keys(this.diffs).join("|");
  }

  selector() {
    return getSelector(this.parent);
  }

  dump(indent = '') {
    return indent + '[TEXT] (' + this.diff() + ') ' + this.text + "\n";
  }
}

const walk = (node, context, i, cb) => {
  cb(node, context);
  if (node.tagName && node.childNodes.length > 0) {
    const cx = context.concat({ node: node, i: i });
    const len = node.childNodes.length;
    for (let i = 0; i < len; i++) {
      walk(node.childNodes[i], cx, i, cb);
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

const nodeEq = (node1, node2) => {
  // undefined, undefined => false
  if (!node1 || !node2) return false;
  return node1.eq(node2);
};

const composeTreeDiff = (diffs) => {
  const ret = [];
  const tree = new DiffTree();
  diffs.forEach((diff) => {
    diff[1].forEach(nt => tree.add(diff[0], nt));
  });
//  tree.fixDiffs();
//  console.log(tree.dump());
  return tree;
};

const diffTree = (tree1, tree2) => {
  const seq1 = treeToNodes(tree1, 0);
  const seq2 = treeToNodes(tree2, 1);
  const diffs = diff(seq1, seq2, nodeEq);
  // dump diffs
//  diffs.forEach((diff) => {
//    console.log(JSON.stringify(diff));
//  });
  const tree = composeTreeDiff(diffs);
  return tree.diffs();
};

module.exports = diffTree;
