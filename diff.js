/**
 * The data structure representing a diff is an array of tuples:
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

module.exports = diff_main = (nodes1, nodes2, eq) => {
  // console.log("diff_main:", nodes1, nodes2);
  // Check for equality (speedup).
  if (nodes1 == nodes2) {
    if (nodes1) {
      return [[DIFF_EQUAL, nodes1]];
    }
    return [];
  }

  if (!nodes1 || nodes1.length === 0) {
    // Just add some text (speedup).
    return [[DIFF_INSERT, nodes2]];
  }

  if (!nodes2 || nodes2.length === 0) {
    // Just delete some text (speedup).
    return [[DIFF_DELETE, nodes1]];
  }

  const longtext = nodes1.length > nodes2.length ? nodes1 : nodes2;
  const shorttext = nodes1.length > nodes2.length ? nodes2 : nodes1;
  const i = longtext.findIndex((n, i, array) => {
    for (let j = 0; j < shorttext.length; j++) {
      if (!eq(array[i + j], shorttext[j])) return false;
    }
    return true;
  });
  if (i != -1) {
    let method = DIFF_INSERT;
    // Swap insertions for deletions if diff is reversed.
    if (nodes1.length > nodes2.length) {
      method = DIFF_DELETE;
    }
    // Shorter text is inside the longer text (speedup).
    const diffs = [];
    if (i > 0) {
      diffs.push([method, longtext.slice(0, i)]);
    }
    diffs.push([DIFF_EQUAL, shorttext]);
    if (i + shorttext.length < longtext.length) {
      diffs.push([method, longtext.slice(i + shorttext.length)]);
    }
    // console.log("add diffs:", diffs);
    return diffs;
  }

  // Compute the diff on the middle block.
  return diff_bisect_(nodes1, nodes2, eq);
};

const diff_bisect_ = (nodes1, nodes2, eq) => {
  // Cache the text lengths to prevent multiple calls.
  const nodes1_length = nodes1.length;
  const nodes2_length = nodes2.length;
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
             eq(nodes1[x1], nodes2[y1])) {
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
            return diff_bisectSplit_(nodes1, nodes2, x1, y1, eq);
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
             eq(nodes1[nodes1_length - x2 - 1],
               nodes2[nodes2_length - y2 - 1])
            ) {
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
            return diff_bisectSplit_(nodes1, nodes2, x1, y1, eq);
          }
        }
      }
    }
  }
  // Diff took too long and hit the deadline or
  // number of diffs equals number of characters, no commonality at all.
  return [[DIFF_DELETE, nodes1], [DIFF_INSERT, nodes2]];
};

const diff_bisectSplit_ = (nodes1, nodes2, x, y, eq) => {
  const nodes1a = nodes1.slice(0, x);
  const nodes2a = nodes2.slice(0, y);
  const nodes1b = nodes1.slice(x);
  const nodes2b = nodes2.slice(y);

//  console.log('bi-sec: ', nodes1a, nodes2a, nodes1b, nodes2b);

  // Compute both diffs serially.
  const diffs = diff_main(nodes1a, nodes2a, eq);
  const diffsb = diff_main(nodes1b, nodes2b, eq);

  return diffs.concat(diffsb);
};
