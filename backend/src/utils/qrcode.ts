// QR Code generator (byte/alphanumeric/numeric modes, versions 1-10, ECC L/M)
// Self-contained, no external dependencies. Renders to SVG string.

const GF_EXP: number[] = new Array(512);
const GF_LOG: number[] = new Array(256);

(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gmul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function genPoly(degree: number): number[] {
  let poly: number[] = [1];
  for (let i = 0; i < degree; i++) {
    const next: number[] = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gmul(poly[j], 1);
      next[j + 1] ^= gmul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen = genPoly(ecLen);
  const rem = new Array(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecLen; i++) {
        rem[i] ^= gmul(gen[i + 1], factor);
      }
    }
  }
  return rem;
}

const LEVEL_BITS: Record<string, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

// versions 1-10: [total codewords, data codewords, ec per block, block groups [blocks, data per block][]]
const VERSION_TABLE: Record<string, [number, number, number, [number, number][]][]> = {
  L: [
    [26, 19, 7, [[1, 19]]], [44, 34, 10, [[1, 34]]], [70, 55, 15, [[1, 55]]], [100, 80, 20, [[1, 80]]],
    [134, 108, 26, [[1, 108]]], [172, 136, 18, [[2, 68]]], [196, 156, 20, [[2, 78]]], [242, 194, 24, [[2, 97]]],
    [292, 232, 30, [[2, 116]]], [346, 274, 36, [[2, 68], [2, 69]]],
  ],
  M: [
    [26, 16, 10, [[1, 16]]], [44, 28, 16, [[1, 28]]], [70, 44, 26, [[1, 44]]], [100, 64, 18, [[2, 32]]],
    [134, 86, 24, [[2, 43]]], [172, 108, 16, [[4, 27]]], [196, 124, 18, [[4, 31]]], [242, 154, 22, [[2, 38], [2, 39]]],
    [292, 182, 22, [[3, 36], [2, 37]]], [346, 216, 26, [[4, 43], [1, 44]]],
  ],
  Q: [
    [26, 13, 13, [[1, 13]]], [44, 22, 22, [[1, 22]]], [70, 34, 18, [[2, 17]]], [100, 48, 26, [[2, 24]]],
    [134, 62, 26, [[2, 15], [2, 16]]], [172, 76, 24, [[4, 19]]], [196, 88, 28, [[2, 14], [4, 15]]], [242, 110, 32, [[4, 18], [2, 19]]],
    [292, 132, 20, [[4, 16], [4, 17]]], [346, 154, 24, [[6, 19], [2, 20]]],
  ],
  H: [
    [26, 9, 17, [[1, 9]]], [44, 16, 28, [[1, 16]]], [70, 26, 22, [[2, 13]]], [100, 36, 16, [[4, 9]]],
    [134, 46, 22, [[2, 11], [2, 12]]], [172, 60, 24, [[4, 15]]], [196, 66, 18, [[4, 13], [1, 14]]], [242, 86, 22, [[4, 14], [2, 15]]],
    [292, 100, 24, [[4, 12], [4, 13]]], [346, 122, 28, [[6, 15], [2, 16]]],
  ],
};

const ALIGNMENT_POS: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function bchDigits(data: number, poly: number, length: number): number {
  let d = data << length;
  const p = poly;
  const topBit = 1 << (Math.floor(Math.log2(p)));
  while (Math.floor(Math.log2(d)) >= Math.floor(Math.log2(topBit))) {
    const shift = Math.floor(Math.log2(d)) - Math.floor(Math.log2(topBit));
    d ^= p << shift;
  }
  return d;
}

export interface QRResult {
  version: number;
  size: number;
  modules: boolean[][];
  mask: number;
  svg: string;
}

function makeMatrix(version: number, level: string, dataCodewords: number[], mask: number, ecCodewords: number[]): { modules: (number | -1)[][]; reserved: boolean[][] } {
  const size = 17 + 4 * version;
  const modules: (number | -1)[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFunc = (r: number, c: number, val: number) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r][c] = val;
    reserved[r][c] = true;
  };

  const drawFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const dark = inside && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        modules[rr][cc] = dark ? 1 : 0;
        reserved[rr][cc] = true;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // timing
  for (let i = 8; i < size - 8; i++) {
    if (modules[6][i] === -1) { modules[6][i] = i % 2 === 0 ? 1 : 0; reserved[6][i] = true; }
    if (modules[i][6] === -1) { modules[i][6] = i % 2 === 0 ? 1 : 0; reserved[i][6] = true; }
  }

  // alignment
  const pos = ALIGNMENT_POS[version] || [];
  for (const r of pos) {
    for (const c of pos) {
      if (modules[r][c] !== -1) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunc(rr, cc, dark ? 1 : 0);
        }
      }
    }
  }

  // dark module
  setFunc(8, 4 * version + 9, 1);

  // format areas (temporarily reserved, filled later)
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { setFunc(8, i, 0); setFunc(i, 8, 0); }
  }
  for (let i = size - 7; i < size; i++) { setFunc(8, i, 0); }
  for (let i = size - 8; i < size; i++) { setFunc(i, 8, 0); }

  // version info areas (v>=7)
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = size - 11; j < size - 8; j++) { setFunc(i, j, 0); setFunc(j, i, 0); }
    }
  }

  // data placement
  const all = dataCodewords.concat(ecCodewords);
  const bitOrder: number[] = [];
  for (const byte of all) {
    for (let b = 7; b >= 0; b--) bitOrder.push((byte >> b) & 1);
  }
  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (reserved[row][c]) continue;
        let bit = bitIdx < bitOrder.length ? bitOrder[bitIdx] : 0;
        bitIdx++;
        bit ^= maskBit(mask, row, c);
        modules[row][c] = bit;
      }
    }
    upward = !upward;
  }

  return { modules, reserved };
}

function maskBit(mask: number, r: number, c: number): number {
  switch (mask) {
    case 0: return (r + c) % 2 === 0 ? 1 : 0;
    case 1: return r % 2 === 0 ? 1 : 0;
    case 2: return c % 3 === 0 ? 1 : 0;
    case 3: return (r + c) % 3 === 0 ? 1 : 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0 ? 1 : 0;
    case 5: return ((r * c) % 2 + (r * c) % 3) === 0 ? 1 : 0;
    case 6: return (((r * c) % 2 + (r * c) % 3) % 2) === 0 ? 1 : 0;
    case 7: return (((r * c) % 3 + (r + c) % 2) % 2) === 0 ? 1 : 0;
    default: return 0;
  }
}

function penaltyScore(modules: (number | -1)[][], size: number): number {
  let penalty = 0;
  const dark = modules.reduce((s, row) => s + row.filter(m => m === 1).length, 0);
  const total = size * size;
  penalty += Math.floor(Math.abs(100 * dark / total - 50) / 5) * 10;

  for (let r = 0; r < size; r++) {
    let run = 0;
    let prev = -1;
    for (let c = 0; c < size; c++) {
      const v = modules[r][c];
      if (v === prev) { run++; } else { if (run >= 5) penalty += 3 + (run - 5); run = 1; prev = v; }
    }
    if (run >= 5) penalty += 3 + (run - 5);
  }
  for (let c = 0; c < size; c++) {
    let run = 0;
    let prev = -1;
    for (let r = 0; r < size; r++) {
      const v = modules[r][c];
      if (v === prev) { run++; } else { if (run >= 5) penalty += 3 + (run - 5); run = 1; prev = v; }
    }
    if (run >= 5) penalty += 3 + (run - 5);
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r][c];
      if (v !== -1 && v === modules[r + 1][c] && v === modules[r][c + 1] && v === modules[r + 1][c + 1]) penalty += 3;
    }
  }
  const finder = (r: number, c: number) => {
    const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    for (let i = 0; i < 11; i++) {
      if (modules[r + i] && modules[r + i][c] === pat[i]) continue;
      return false;
    }
    return true;
  };
  for (let r = 0; r < size - 11; r++) {
    for (let c = 0; c < size; c++) {
      if (finder(r, c)) penalty += 40;
    }
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size - 11; c++) {
      let ok = true;
      for (let i = 0; i < 11; i++) {
        if (modules[r][c + i] === 1) { ok = false; break; }
      }
      if (ok) {
        let darkCount = 0;
        for (let i = 0; i < 11; i++) if (modules[r][c + i] === 1) darkCount++;
        if (darkCount <= 1) penalty += 40;
      }
    }
  }
  return penalty;
}

function applyFormat(modules: (number | -1)[][], reserved: boolean[][], size: number, version: number, level: string, mask: number) {
  const ecBits = LEVEL_BITS[level] ?? 0b01;
  const rem = bchDigits((ecBits << 3) | mask, 0b10100110111, 10);
  const bits = (((ecBits << 3) | mask) << 10 | rem) ^ 0b101010000010010;
  const layout: [number, number][] = [];
  for (let i = 0; i <= 5; i++) layout.push([8, i]);
  layout.push([8, 7]);
  layout.push([8, 8]);
  layout.push([7, 8]);
  for (let i = 9; i < 15; i++) layout.push([14 - i, 8]);
  for (let i = 0; i < 8; i++) layout.push([size - 1 - i, 8]);
  for (let i = 8; i < 15; i++) layout.push([8, size - 15 + i]);

  layout.forEach(([r, c], i) => {
    modules[r][c] = (bits >> i) & 1;
    reserved[r][c] = true;
  });
}

function applyVersionInfo(modules: (number | -1)[][], size: number, version: number) {
  if (version < 7) return;
  const rem = bchDigits(version, 0b1111100100101, 12);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const a = (bits >> i) & 1;
    const r1 = Math.floor(i / 3);
    const c1 = (i % 3) + size - 11;
    modules[r1][c1] = a;
    modules[c1][r1] = a;
  }
}

export function generateQR(data: string, opts?: { level?: string; version?: number; scale?: number }): QRResult {
  const level = (opts?.level || 'L').toUpperCase();
  if (!VERSION_TABLE[level]) throw new Error(`Unsupported QR error correction level: ${level}`);
  const forcedVersion = opts?.version || 0;

  // build data bits (mode chosen from content)
  const isNumeric = /^[0-9]*$/.test(data);
  const isAlpha = !isNumeric && /^[0-9A-Z $%*+\-./:]*$/.test(data);
  let modeBits = 0b0100;
  let dataBits: string = '';
  let countValue = data.length;
  if (isNumeric) {
    modeBits = 0b0001;
    const groups = data.match(/\d{1,3}/g) || [];
    for (const g of groups) {
      const val = parseInt(g, 10);
      dataBits += val.toString(2).padStart(g.length === 3 ? 10 : g.length === 2 ? 7 : 4, '0');
    }
  } else if (isAlpha) {
    modeBits = 0b0010;
    const pairs: string[] = [];
    for (let i = 0; i < data.length; i += 2) pairs.push(data.slice(i, i + 2));
    for (const p of pairs) {
      if (p.length === 2) {
        dataBits += (ALPHA.indexOf(p[0]) * 45 + ALPHA.indexOf(p[1])).toString(2).padStart(11, '0');
      } else {
        dataBits += ALPHA.indexOf(p[0]).toString(2).padStart(6, '0');
      }
    }
  } else {
    modeBits = 0b0100;
    const buf = Buffer.from(data, 'utf8');
    countValue = buf.length;
    dataBits = Array.from(buf).map(b => b.toString(2).padStart(8, '0')).join('');
  }

  // choose version
  const countBitsFor = (v: number) =>
    modeBits === 0b0001 ? (v >= 10 ? 12 : 10) : modeBits === 0b0010 ? (v >= 10 ? 11 : 9) : (v >= 10 ? 16 : 8);
  let version = forcedVersion;
  if (!version) {
    for (let v = 1; v <= 10; v++) {
      const needed = 4 + countBitsFor(v) + dataBits.length + 4;
      const cap = VERSION_TABLE[level][v - 1][1] * 8;
      if (needed <= cap) { version = v; break; }
    }
    if (!version) throw new Error('Data too large for QR (max version 10)');
  }
  const [totalCW, dataCW, ecLen, groups] = VERSION_TABLE[level][version - 1];
  const capBits = dataCW * 8;
  const countLen = countBitsFor(version);
  const countBits = countValue.toString(2).padStart(countLen, '0');
  let stream = modeBits.toString(2).padStart(4, '0') + countBits + dataBits;
  if (stream.length > capBits) throw new Error(`Data too large for QR version ${version}`);

  // terminator + pad to bytes
  const terminator = Math.min(4, capBits - stream.length);
  if (terminator > 0) stream += '0'.repeat(terminator);
  while (stream.length % 8 !== 0) stream += '0';

  const codewords: number[] = [];
  for (let i = 0; i < stream.length; i += 8) codewords.push(parseInt(stream.slice(i, i + 8), 2));
  let pad = 0xec;
  while (codewords.length < dataCW) { codewords.push(pad); pad = pad === 0xec ? 0x11 : 0xec; }

  // split into blocks and compute EC per block
  const blocks: { data: number[]; ec: number[] }[] = [];
  let cursor = 0;
  for (const [blockCount, perBlock] of groups) {
    for (let b = 0; b < blockCount; b++) {
      const chunk = codewords.slice(cursor, cursor + perBlock);
      cursor += perBlock;
      blocks.push({ data: chunk, ec: rsEncode(chunk, ecLen) });
    }
  }
  const interleaved: number[] = [];
  const maxData = groups.reduce((m, g) => Math.max(m, g[1]), 0);
  for (let i = 0; i < maxData; i++) {
    for (const blk of blocks) if (i < blk.data.length) interleaved.push(blk.data[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const blk of blocks) interleaved.push(blk.ec[i]);
  }

  // choose best mask
  const size = 17 + 4 * version;
  let best: { modules: (number | -1)[][]; mask: number } | null = null;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const { modules, reserved } = makeMatrix(version, level, interleaved.slice(0, dataCW), m, interleaved.slice(dataCW));
    applyFormat(modules, reserved, size, version, level, m);
    applyVersionInfo(modules, size, version);
    const score = penaltyScore(modules, size);
    if (score < bestScore) { bestScore = score; best = { modules, mask: m }; }
  }

  const finalModules: boolean[][] = (best?.modules || []).map(row => row.map(m => m === 1));
  const svg = toSVG(finalModules, opts?.scale || 8);

  return { version, size, modules: finalModules, mask: best?.mask || 0, svg };
}

function toSVG(modules: boolean[][], scale: number): string {
  const n = modules.length;
  const parts: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules[r][c]) parts.push(`M${c * scale},${r * scale}h${scale}v${scale}h-${scale}z`);
    }
  }
  const dim = n * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}"><path d="${parts.join('')}" fill="#000"/></svg>`;
}

// exposed for tests
export const __internals = { rsEncode, makeMatrix, applyFormat, applyVersionInfo, maskBit };
