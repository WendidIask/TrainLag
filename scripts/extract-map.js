import fs from 'fs';
import { DOMParser } from 'xmldom';
import xpath from 'xpath';
import { svgPathProperties } from "svg-path-properties";

const svg = fs.readFileSync('./components/data/GameMap.svg', 'utf8');
const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');

// ----------------------
// Transform Utilities
// ----------------------
function multiplyMatrices(a, b) {
  const [a0,a1,a2,a3,a4,a5] = a;
  const [b0,b1,b2,b3,b4,b5] = b;
  return [
    a0*b0 + a2*b1,
    a1*b0 + a3*b1,
    a0*b2 + a2*b3,
    a1*b2 + a3*b3,
    a0*b4 + a2*b5 + a4,
    a1*b4 + a3*b5 + a5
  ];
}

function applyMatrix(m, x, y) {
  const [a,b,c,d,e,f] = m;
  return [a*x + c*y + e, b*x + d*y + f];
}

function matTranslate(tx, ty=0) { return [1,0,0,1,tx,ty]; }
function matScale(sx, sy=sx) { return [sx,0,0,sy,0,0]; }
function matRotate(angleDeg, cx=0, cy=0) {
  const a = angleDeg*Math.PI/180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const R = [cos,sin,-sin,cos,0,0];
  if (cx || cy) return multiplyMatrices(matTranslate(cx,cy), multiplyMatrices(R, matTranslate(-cx,-cy)));
  return R;
}
function matSkewX(angleDeg) { return [1,0,Math.tan(angleDeg*Math.PI/180),1,0,0]; }
function matSkewY(angleDeg) { return [1,Math.tan(angleDeg*Math.PI/180),0,1,0,0]; }

function parseTransform(transform) {
  if (!transform) return [1,0,0,1,0,0];
  let M = [1,0,0,1,0,0];
  const re = /([a-zA-Z]+)\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(transform))) {
    const type = m[1], nums = m[2].trim().split(/[\s,]+/).map(Number);
    let Op = [1,0,0,1,0,0];
    switch(type) {
      case 'translate': Op = matTranslate(nums[0], nums[1]||0); break;
      case 'scale': Op = matScale(nums[0], nums[1]||nums[0]); break;
      case 'rotate': Op = matRotate(nums[0], nums[1]||0, nums[2]||0); break;
      case 'skewX': Op = matSkewX(nums[0]); break;
      case 'skewY': Op = matSkewY(nums[0]); break;
      case 'matrix': Op = nums; break;
    }
    M = multiplyMatrices(M, Op);
  }
  return M;
}

function getGlobalMatrix(node) {
  // Accumulate transforms from root → node
  let matrix = [1,0,0,1,0,0];
  const nodes = [];
  let cur = node;
  while (cur) {
    nodes.unshift(cur); // root first
    cur = cur.parentNode;
  }

  for (const n of nodes) {
    if (n.getAttribute) {
      const t = parseTransform(n.getAttribute('transform'));
      matrix = multiplyMatrices(matrix, t); // parent first
    }
  }
  return matrix;
}

// ----------------------
// Ellipse Processing
// ----------------------
function getEllipseData(ellipse, group) {
  let cx = parseFloat(ellipse.getAttribute('cx'));
  let cy = parseFloat(ellipse.getAttribute('cy'));
  [cx,cy] = applyMatrix(getGlobalMatrix(ellipse), cx, cy);
  cx = Math.round(cx); cy = Math.round(cy);

  const texts = Array.from(group.getElementsByTagName('text'));
  let minDist = Infinity, name = null;
  for (const text of texts) {
    let tx = parseFloat(text.getAttribute('x'));
    let ty = parseFloat(text.getAttribute('y'));
    [tx,ty] = applyMatrix(getGlobalMatrix(text), tx, ty);
    const d = Math.hypot(cx-tx, cy-ty);
    if (d<minDist) { minDist=d; name=text.textContent.trim(); }
  }

  return { cx, cy, name, id: ellipse.getAttribute('id') };
}

const ellipses = [];
const ellipseNodes = xpath.select("//*[local-name()='ellipse']", doc);
for (const ellipse of ellipseNodes) {
  let group = ellipse.parentNode;
  while(group && group.nodeName.toLowerCase()!=='g') group = group.parentNode;
  ellipses.push(getEllipseData(ellipse, group));
}

// ----------------------
// Path Processing
// ----------------------
function findNearestEllipse(x, y) {
  let minDist = Infinity, nearest = null;
  ellipses.forEach(e => {
    const d = Math.hypot(e.cx - x, e.cy - y);
    if (d < minDist) { minDist = d; nearest = e; }
  });
  return nearest;
}

const paths = [];
const pathNodes = xpath.select("//*[local-name()='path']", doc);
for (const path of pathNodes) {
  const d = path.getAttribute('d');
  if (!d) continue;

  const style = path.getAttribute('style') || '';
  if (!style.includes('stroke-width:0.6')) continue;

  const matrix = getGlobalMatrix(path);

  // Use SVGPathProperties to get exact start and end
  const properties = new svgPathProperties(d);
  const { x: x1, y: y1 } = properties.getPointAtLength(0);
  const { x: x2, y: y2 } = properties.getPointAtLength(properties.getTotalLength());

    let [tx1, ty1] = applyMatrix(matrix, x1, y1);
    let [tx2, ty2] = applyMatrix(matrix, x2, y2);
    tx1 = Math.round(tx1); ty1 = Math.round(ty1);
    tx2 = Math.round(tx2); ty2 = Math.round(ty2);

    const start = findNearestEllipse(tx1, ty1);
    const end = findNearestEllipse(tx2, ty2);

    paths.push({
        d,
        from: start ? start.name : null,
        to: end ? end.name : null,
        start: [tx1, ty1],
        end: [tx2, ty2]
    });
}

const nodes = new Set();
const edges = [];

for (const p of paths) {
  if (p.from && p.to) {
    nodes.add(p.from);
    nodes.add(p.to);
    edges.push({ path: p.d, from: p.from, to: p.to });
    edges.push({ path: p.d, from: p.to, to: p.from });
  }
}

const graph = {
  name: "Default Map",
  nodes: Array.from(nodes),
  edges
};

// ----------------------
// Output results
// ----------------------
fs.writeFileSync('./components/data/map-nodes.json', JSON.stringify(ellipses, null, 2));
fs.writeFileSync('./components/data/map-paths.json', JSON.stringify(graph, null, 2));
console.log('Extraction complete with transforms applied, first & last endpoints.');