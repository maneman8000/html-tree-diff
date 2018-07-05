/**
 * The data structure representing a diff is an array of tuples:
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

let Nodes;

const diff_main_ = (nodes1, nodes2, nodes_class) => {
  Nodes = nodes_class;
  return diff_main(nodes1, nodes2);
};

const diff_main = (nodes1, nodes2) => {
  // console.log("diff_main:", nodes1, nodes2);

  // Check for equality (speedup).
  if (nodes1.eq(nodes2)) {
    if (nodes1.length() > 0) {
      return [[DIFF_EQUAL, nodes1.merge(nodes2)]];
    }
    return [];
  }

  // Trim off common prefix (speedup).
  const commonlength1 = diff_commonPrefix(nodes1, nodes2);
  const commonprefix1 = nodes1.slice(0, commonlength1);
  const commonprefix2 = nodes2.slice(0, commonlength1);
  nodes1 = nodes1.slice(commonlength1);
  nodes2 = nodes2.slice(commonlength1);

  // Trim off common suffix (speedup).
  const commonlength2 = diff_commonSuffix(nodes1, nodes2);
  const commonsuffix1 = nodes1.slice(nodes1.length() - commonlength2);
  const commonsuffix2 = nodes2.slice(nodes2.length() - commonlength2);
  nodes1 = nodes1.slice(0, nodes1.length() - commonlength2);
  nodes2 = nodes2.slice(0, nodes2.length() - commonlength2);

  // Compute the diff on the middle block.
  const diffs = diff_compute_(nodes1, nodes2);

  // Restore the prefix and suffix.
  if (commonprefix1.length() > 0) {
    diffs.unshift([DIFF_EQUAL, commonprefix1.merge(commonprefix2)]);
  }
  if (commonsuffix1.length() > 0) {
    diffs.push([DIFF_EQUAL, commonsuffix1.merge(commonsuffix2)]);
  }
  diff_cleanupMerge(diffs);
  diff_cleanupSemanticLossless(diffs);
  return diffs;
};

const diff_compute_ = (nodes1, nodes2) => {
  if (!nodes1 || nodes1.length() === 0) {
    // Just add some text (speedup).
    return [[DIFF_INSERT, nodes2]];
  }

  if (!nodes2 || nodes2.length() === 0) {
    // Just delete some text (speedup).
    return [[DIFF_DELETE, nodes1]];
  }

  const longnodes = nodes1.length() > nodes2.length() ? nodes1 : nodes2;
  const shortnodes = nodes1.length() > nodes2.length() ? nodes2 : nodes1;
  const i = longnodes.findIndex((n, i, array) => {
    if (longnodes.length() - i < shortnodes.length()) return false;
    return shortnodes.every((n, j) => n.eq(longnodes.at(i + j)));
  });
  if (i != -1) {
    let method = DIFF_INSERT;
    // Swap insertions for deletions if diff is reversed.
    if (nodes1.length() > nodes2.length()) {
      method = DIFF_DELETE;
    }
    // Shorter text is inside the longer text (speedup).
    const diffs = [];
    if (i > 0) {
      diffs.push([method, longnodes.slice(0, i)]);
    }
    diffs.push([DIFF_EQUAL, shortnodes.merge(longnodes.slice(i, shortnodes.length() + i))]);
    if (i + shortnodes.length() < longnodes.length()) {
      diffs.push([method, longnodes.slice(i + shortnodes.length())]);
    }
    return diffs;
  }

  if (shortnodes.length() == 1) {
    // Single character string.
    // After the previous speedup, the character can't be an equality.
    return [[DIFF_DELETE, nodes1],
            [DIFF_INSERT, nodes2]];
  }

  return diff_bisect_(nodes1, nodes2);
};

const diff_bisect_ = (nodes1, nodes2) => {
  // Cache the text lengths to prevent multiple calls.
  const nodes1_length = nodes1.length();
  const nodes2_length = nodes2.length();
  const max_d = Math.ceil((nodes1_length + nodes2_length) / 2);
  const v_offset = max_d;
  const v_length = 2 * max_d;
  const v1 = new Array(v_length);
  const v2 = new Array(v_length);
  // Setting all elements to -1 is faster in Chrome & Firefox than mixing
  // integers and undefined.
  for (let x = 0; x < v_length; x++) {
    v1[x] = -1;
    v2[x] = -1;
  }
  v1[v_offset + 1] = 0;
  v2[v_offset + 1] = 0;
  const delta = nodes1_length - nodes2_length;
  // If the total number of characters is odd, then the front path will collide
  // with the reverse path.
  const front = (delta % 2 != 0);
  // Offsets for start and end of k loop.
  // Prevents mapping of space beyond the grid.
  let k1start = 0;
  let k1end = 0;
  let k2start = 0;
  let k2end = 0;
  for (let d = 0; d < max_d; d++) {
    // Walk the front path one step.
    for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      const k1_offset = v_offset + k1;
      let x1;
      if (k1 == -d || (k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1])) {
        x1 = v1[k1_offset + 1];
      } else {
        x1 = v1[k1_offset - 1] + 1;
      }
      let y1 = x1 - k1;
      while (x1 < nodes1_length && y1 < nodes2_length &&
             nodes1.at(x1).eq(nodes2.at(y1))) {
        x1++;
        y1++;
      }
      v1[k1_offset] = x1;
      if (x1 > nodes1_length) {
        // Ran off the right of the graph.
        k1end += 2;
      } else if (y1 > nodes2_length) {
        // Ran off the bottom of the graph.
        k1start += 2;
      } else if (front) {
        const k2_offset = v_offset + delta - k1;
        if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1) {
          // Mirror x2 onto top-left coordinate system.
          const x2 = nodes1_length - v2[k2_offset];
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(nodes1, nodes2, x1, y1);
          }
        }
      }
    }

    // Walk the reverse path one step.
    for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      const k2_offset = v_offset + k2;
      let x2;
      if (k2 == -d || (k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1])) {
        x2 = v2[k2_offset + 1];
      } else {
        x2 = v2[k2_offset - 1] + 1;
      }
      let y2 = x2 - k2;
      while (x2 < nodes1_length && y2 < nodes2_length &&
             nodes1.at(nodes1_length - x2 - 1).eq(nodes2.at(nodes2_length - y2 - 1))) {
        x2++;
        y2++;
      }
      v2[k2_offset] = x2;
      if (x2 > nodes1_length) {
        // Ran off the left of the graph.
        k2end += 2;
      } else if (y2 > nodes2_length) {
        // Ran off the top of the graph.
        k2start += 2;
      } else if (!front) {
        const k1_offset = v_offset + delta - k2;
        if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {
          const x1 = v1[k1_offset];
          const y1 = v_offset + x1 - k1_offset;
          // Mirror x2 onto top-left coordinate system.
          x2 = nodes1_length - x2;
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(nodes1, nodes2, x1, y1);
          }
        }
      }
    }
  }
  // Diff took too long and hit the deadline or
  // number of diffs equals number of characters, no commonality at all.
  return [[DIFF_DELETE, nodes1], [DIFF_INSERT, nodes2]];
};

const diff_bisectSplit_ = (nodes1, nodes2, x, y) => {
  const nodes1a = nodes1.slice(0, x);
  const nodes2a = nodes2.slice(0, y);
  const nodes1b = nodes1.slice(x);
  const nodes2b = nodes2.slice(y);

//  console.log('bi-sec: ', nodes1a, nodes2a, nodes1b, nodes2b);

  // Compute both diffs serially.
  const diffs = diff_main(nodes1a, nodes2a);
  const diffsb = diff_main(nodes1b, nodes2b);

  return diffs.concat(diffsb);
};

const diff_commonPrefix = (nodes1, nodes2, exactly = false) => {
  // Quick check for common null cases.
  if (!nodes1 || nodes1.length() === 0 || !nodes2 || nodes2.length() === 0 ||
      !nodes1.at(0).eq(nodes2.at(0), exactly)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: https://neil.fraser.name/news/2007/10/09/
  let pointermin = 0;
  let pointermax = Math.min(nodes1.length(), nodes2.length());
  let pointermid = pointermax;
  let pointerstart = 0;
  while (pointermin < pointermid) {
    if (nodes1.slice(pointerstart, pointermid).eq(nodes2.slice(pointerstart, pointermid), exactly)) {
      pointermin = pointermid;
      pointerstart = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};

const diff_commonSuffix = (nodes1, nodes2, exactly = false) => {
  // Quick check for common null cases.
  if (!nodes1 || nodes1.length() === 0 || !nodes2 || nodes2.length() === 0 ||
      !nodes1.at(nodes1.length() - 1).eq(nodes2.at(nodes2.length() - 1), exactly)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: https://neil.fraser.name/news/2007/10/09/
  let pointermin = 0;
  let pointermax = Math.min(nodes1.length(), nodes2.length());
  let pointermid = pointermax;
  let pointerend = 0;
  while (pointermin < pointermid) {
    if (nodes1.slice(nodes1.length() - pointermid, nodes1.length() - pointerend).eq(
          nodes2.slice(nodes2.length() - pointermid, nodes2.length() - pointerend), exactly)) {
      pointermin = pointermid;
      pointerend = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};

const diff_cleanupMerge = (diffs) => {
  // Add a dummy entry at the end.
  diffs.push([DIFF_EQUAL, new Nodes()]);
  let pointer = 0;
  let count_delete = 0;
  let count_insert = 0;
  let nodes_delete = new Nodes();
  let nodes_insert = new Nodes();
  let commonlength;
  while (pointer < diffs.length) {
    switch (diffs[pointer][0]) {
      case DIFF_INSERT:
        count_insert++;
        nodes_insert.append(diffs[pointer][1]);
        pointer++;
        break;
      case DIFF_DELETE:
        count_delete++;
        nodes_delete.append(diffs[pointer][1]);
        pointer++;
        break;
      case DIFF_EQUAL:
        // Upon reaching an equality, check for prior redundancies.
        if (count_delete + count_insert > 1) {
          if (count_delete !== 0 && count_insert !== 0) {
            // Factor out any common prefixies.
            commonlength = diff_commonPrefix(nodes_insert, nodes_delete);
            if (commonlength !== 0) {
              if ((pointer - count_delete - count_insert) > 0 &&
                  diffs[pointer - count_delete - count_insert - 1][0] ==
                  DIFF_EQUAL) {
                diffs[pointer - count_delete - count_insert - 1][1].append(
                  nodes_insert.slice(0, commonlength).merge(nodes_delete.slice(0, commonlength)));
              } else {
                diffs.splice(0, 0,
                  [DIFF_EQUAL, nodes_insert.slice(0, commonlength).merge(nodes_delete.slice(0, commonlength))]);
                pointer++;
              }
              nodes_insert = nodes_insert.slice(commonlength);
              nodes_delete = nodes_delete.slice(commonlength);
            }
            // Factor out any common suffixies.
            commonlength = diff_commonSuffix(nodes_insert, nodes_delete);
            if (commonlength !== 0) {
              diffs[pointer][1] = nodes_insert.slice(nodes_insert.length() - commonlength).
                merge(nodes_delete.slice(nodes_delete.length() - commonlength)).
                append(diffs[pointer][1]);
              nodes_insert = nodes_insert.slice(0, nodes_insert.length() -
                  commonlength);
              nodes_delete = nodes_delete.slice(0, nodes_delete.length() -
                  commonlength);
            }
          }
          // Delete the offending records and add the merged ones.
          pointer -= count_delete + count_insert;
          diffs.splice(pointer, count_delete + count_insert);
          if (nodes_delete.length()) {
            diffs.splice(pointer, 0, [DIFF_DELETE, nodes_delete]);
            pointer++;
          }
          if (nodes_insert.length()) {
            diffs.splice(pointer, 0, [DIFF_INSERT, nodes_insert]);
            pointer++;
          }
          pointer++;
        } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {
          // Merge this equality with the previous one.
          diffs[pointer - 1][1].append(diffs[pointer][1]);
          diffs.splice(pointer, 1);
        } else {
          pointer++;
        }
        count_insert = 0;
        count_delete = 0;
        nodes_delete = new Nodes();
        nodes_insert = new Nodes();
        break;
    }
  }
  if (diffs[diffs.length - 1][1].length() === 0) {
    diffs.pop();  // Remove the dummy entry at the end.
  }

  // Second pass: look for single edits surrounded on both sides by equalities
  // which can be shifted sideways to eliminate an equality.
  // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
  var changes = false;
  pointer = 1;
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      if (diffs[pointer][1].slice(diffs[pointer][1].length() -
            diffs[pointer - 1][1].length()).eq(diffs[pointer - 1][1], true)) {
        // Shift the edit over the previous equality.
        diffs[pointer][1] = diffs[pointer - 1][1].concat(
          diffs[pointer][1].slice(
            0, diffs[pointer][1].length() - diffs[pointer - 1][1].length()));
        diffs[pointer + 1][1] = diffs[pointer - 1][1].concat(diffs[pointer + 1][1]);
        diffs.splice(pointer - 1, 1);
        changes = true;
      } else if (diffs[pointer][1].slice(0, diffs[pointer + 1][1].length()).
                 eq(diffs[pointer + 1][1], true)) {
        // Shift the edit over the next equality.
        diffs[pointer - 1][1].append(diffs[pointer + 1][1]);
        diffs[pointer][1] = diffs[pointer][1].slice(diffs[pointer + 1][1].length()).
          concat(diffs[pointer + 1][1]);
        diffs.splice(pointer + 1, 1);
        changes = true;
      }
    }
    pointer++;
  }
  // If shifts were made, the diff needs reordering and another shift sweep.
  if (changes) {
    diff_cleanupMerge(diffs);
  }
};

const diff_nodesCost = (n1, n2, num) => {
  const p1 = n1.getPath(num);
  const p2 = n2.getPath(num);
  for (let i = 0; i < p1.length; i++) {
    if (!p2[i] || p1[i] !== p2[i]) return p1.length - i;
  }
  return 0;
};

const diff_cleanupSemanticCost_ = (one, two, length, pathNums) => {
  if (!one || one.length() === 0 || !two || two.length() === 0) {
    // Edges are the best.
    return 0;
  }
  let cost1 = 0, cost2 = 0;
  for (let i = one.length() - length - 1 > 0 ? one.length() - length - 1 : 0;
       i < one.length() - 1; i++) {
    cost1 += diff_nodesCost(one.at(i), one.at(i+1), pathNums[0]);
  }
  const endTwo = length < two.length() - 1 ? length : two.length() - 1;
  for (let i = 0; i < endTwo; i++) {
    cost2 += diff_nodesCost(two.at(i), two.at(i+1), pathNums[1]);
  }
  return cost1 + cost2;
};

const diff_cleanupSemanticLossless = (diffs) => {

  let pointer = 1;
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      let equality1 = diffs[pointer - 1][1].slice(0);
      let edit = diffs[pointer][1].slice(0);
      let equality2 = diffs[pointer + 1][1].slice(0);
      const editPathNum = diffs[pointer][0] === DIFF_INSERT ? 1 : 0;

      // First, shift the edit as far left as possible.
      const commonOffset1 = diff_commonSuffix(equality1, edit, true);
      const commonOffset2 = diff_commonPrefix(edit, equality2, true);
      const commonOffsetMax = Math.max(commonOffset1, commonOffset2);
      if (commonOffset1) {
        const commonString = edit.slice(edit.length() - commonOffset1).
                merge(equality1.slice(equality1.length() - commonOffset1));
        equality1 = equality1.slice(0, equality1.length() - commonOffset1);
        edit = commonString.concat(edit.slice(0, edit.length() - commonOffset1));
        equality2 = commonString.concat(equality2);
      }

      // Second, step character by character right, looking for the best fit.
      let bestEquality1 = equality1.slice(0);
      let bestEdit = edit;
      let bestEquality2 = equality2.slice(0);
      let bestCost = diff_cleanupSemanticCost_(equality1, edit, commonOffsetMax, [0, editPathNum]) +
            diff_cleanupSemanticCost_(edit, equality2, commonOffsetMax, [editPathNum, 0]);
      while (edit.at(0).eq(equality2.at(0), true)) {
        equality1.append(edit.slice(0,1).merge(equality2.slice(0,1)));
        edit = edit.slice(1);
        edit.push(equality2.at(0));
        equality2 = equality2.slice(1);
        const cost = diff_cleanupSemanticCost_(equality1, edit, commonOffsetMax, [0, editPathNum]) +
                diff_cleanupSemanticCost_(edit, equality2, commonOffsetMax, [editPathNum, 0]);
        // The >= encourages trailing rather than leading whitespace on edits.
        if (cost <= bestCost) {
          bestCost = cost;
          bestEquality1 = equality1.slice(0);
          bestEdit = edit;
          bestEquality2 = equality2.slice(0);
        }
      }

      if (!diffs[pointer - 1][1].eq(bestEquality1)) {
        // We have an improvement, save it back to the diff.
        if (bestEquality1 && bestEquality1.length() > 0) {
          diffs[pointer - 1][1] = bestEquality1;
        } else {
          diffs.splice(pointer - 1, 1);
          pointer--;
        }
        diffs[pointer][1] = bestEdit;
        if (bestEquality2 && bestEquality2.length() > 0) {
          diffs[pointer + 1][1] = bestEquality2;
        } else {
          diffs.splice(pointer + 1, 1);
          pointer--;
        }
      }
    }
    pointer++;
  }
};

module.exports = diff_main_;
