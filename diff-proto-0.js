/**
 * The data structure representing a diff is an array of tuples:
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

const INITIAL_V = -1;

const vStringify = (v, v_offset) => {
  return JSON.stringify(v.map((v, i) => { return [i - v_offset, v]; }).filter((v) => v[1] !== INITIAL_V));
};

const greedy = (text1, text2) => {
  const text1_len = text1.length;
  const text2_len = text2.length;
  const max_d = text1_len + text2_len;
  const v_offset = max_d;
  const v_length = 2 * max_d;
  const v = new Array(v_length);
  // Setting all elements to -1 is faster in Chrome & Firefox than mixing
  // integers and undefined.
  for (let x = 0; x < v_length; x++) {
    v[x] = INITIAL_V;
  }
  v[v_offset + 1] = 0;

  for (let d = 0; d < max_d; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x, y;
      let k_offset = v_offset + k;
      if (k === -d || (k !== d && v[k_offset-1] < v[k_offset+1])) {
        x = v[k_offset + 1];
      }
      else {
        x = v[k_offset - 1] + 1;
      }
      y = x - k;
      console.log(d, k, x, y);
      while (x < text1_len && y < text2_len &&
             text1.charAt(x) === text2.charAt(y)) {
        x++;
        y++;
        console.log('find snake');
      }
      v[k_offset] = x;
      if (x >= text1_len && y >= text2_len) {
        console.log("end: ", d, k, k_offset, vStringify(v, v_offset));
        return;
      }
    }
    console.log("con: ", d, vStringify(v, v_offset));
  }
};

const diff_main = (text1, text2) => {
  console.log("diff_main:", text1, text2);
  // Check for equality (speedup).
  if (text1 == text2) {
    if (text1) {
      return [[DIFF_EQUAL, text1]];
    }
    return [];
  }

  if (!text1) {
    console.log("ins:", text2);
    // Just add some text (speedup).
    return [[DIFF_INSERT, text2]];
  }

  if (!text2) {
    console.log("del:", text1);
    // Just delete some text (speedup).
    return [[DIFF_DELETE, text1]];
  }

  const longtext = text1.length > text2.length ? text1 : text2;
  const shorttext = text1.length > text2.length ? text2 : text1;
  const i = longtext.indexOf(shorttext);
  if (i != -1) {
    let method = DIFF_INSERT;
    // Swap insertions for deletions if diff is reversed.
    if (text1.length > text2.length) {
      method = DIFF_DELETE;
    }
    // Shorter text is inside the longer text (speedup).
    const diffs = [];
    if (i > 0) {
      diffs.push([method, longtext.substring(0, i)]);
    }
    diffs.push([DIFF_EQUAL, shorttext]);
    if (i + shorttext.length < longtext.length) {
      diffs.push([method, longtext.substring(i + shorttext.length)]);
    }
//    console.log("add diffs:", diffs);
    return diffs;
  }

  // Compute the diff on the middle block.
  return diff_bisect_(text1, text2);
};

const diff_bisect_ = (text1, text2) => {
  // Cache the text lengths to prevent multiple calls.
  const text1_length = text1.length;
  const text2_length = text2.length;
  const max_d = Math.ceil((text1_length + text2_length) / 2);
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
  const delta = text1_length - text2_length;
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
      while (x1 < text1_length && y1 < text2_length &&
             text1.charAt(x1) == text2.charAt(y1)) {
        x1++;
        y1++;
      }
      v1[k1_offset] = x1;
      if (x1 > text1_length) {
        // Ran off the right of the graph.
        k1end += 2;
      } else if (y1 > text2_length) {
        // Ran off the bottom of the graph.
        k1start += 2;
      } else if (front) {
        const k2_offset = v_offset + delta - k1;
        if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1) {
          // Mirror x2 onto top-left coordinate system.
          const x2 = text1_length - v2[k2_offset];
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(text1, text2, x1, y1);
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
      while (x2 < text1_length && y2 < text2_length &&
             text1.charAt(text1_length - x2 - 1) ==
             text2.charAt(text2_length - y2 - 1)) {
        x2++;
        y2++;
      }
      v2[k2_offset] = x2;
      if (x2 > text1_length) {
        // Ran off the left of the graph.
        k2end += 2;
      } else if (y2 > text2_length) {
        // Ran off the top of the graph.
        k2start += 2;
      } else if (!front) {
        const k1_offset = v_offset + delta - k2;
        if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {
          const x1 = v1[k1_offset];
          const y1 = v_offset + x1 - k1_offset;
          // Mirror x2 onto top-left coordinate system.
          x2 = text1_length - x2;
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(text1, text2, x1, y1);
          }
        }
      }
    }
  }
  // Diff took too long and hit the deadline or
  // number of diffs equals number of characters, no commonality at all.
  return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
};

const diff_bisectSplit_ = (text1, text2, x, y) => {
  const text1a = text1.substring(0, x);
  const text2a = text2.substring(0, y);
  const text1b = text1.substring(x);
  const text2b = text2.substring(y);

//  console.log('bi-sec: ', text1a, text2a, text1b, text2b);

  // Compute both diffs serially.
  const diffs = diff_main(text1a, text2a);
  const diffsb = diff_main(text1b, text2b);

  return diffs.concat(diffsb);
};

const ret = diff_main("abcabba", "cbabac");
// const ret = diff_main("abgdef", "gh");
// const ret = diff_main("gh", "abgdef");
console.log("ret:", ret);
//greedy("abc", "cb");
// greedy("abc", "bc");

