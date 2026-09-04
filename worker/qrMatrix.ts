/*
 * Minimal QR Code Model 2 generator for short ASCII verification tokens.
 * Fixed to Version 4 / Error Correction L (33x33 modules, up to 78 bytes).
 * This keeps Cloudflare Worker PDF generation dependency-free.
 */

const VERSION = 4;
const MODULE_COUNT = VERSION * 4 + 17;
const DATA_CODEWORDS = 80;
const ECC_CODEWORDS = 20;
const MAX_INPUT_BYTES = 78;
const ERROR_CORRECTION_L = 1;
const G15 = 0x0537;
const G15_MASK = 0x5412;

const EXP_TABLE = new Array(512).fill(0);
const LOG_TABLE = new Array(256).fill(0);
for (let i = 0; i < 8; i += 1) EXP_TABLE[i] = 1 << i;
for (let i = 8; i < 256; i += 1) {
  EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
}
for (let i = 0; i < 255; i += 1) LOG_TABLE[EXP_TABLE[i]] = i;
for (let i = 256; i < 512; i += 1) EXP_TABLE[i] = EXP_TABLE[i - 255];

function gexp(value: number): number {
  let n = value;
  while (n < 0) n += 255;
  while (n >= 256) n -= 255;
  return EXP_TABLE[n];
}

function glog(value: number): number {
  if (value < 1) throw new Error('QR logarithm input must be positive.');
  return LOG_TABLE[value];
}

function polyMultiply(left: number[], right: number[]): number[] {
  const result = new Array(left.length + right.length - 1).fill(0);
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      if (left[i] !== 0 && right[j] !== 0) result[i + j] ^= gexp(glog(left[i]) + glog(right[j]));
    }
  }
  return result;
}

function generatorPolynomial(length: number): number[] {
  let result = [1];
  for (let i = 0; i < length; i += 1) result = polyMultiply(result, [1, gexp(i)]);
  return result;
}

function calculateEcc(data: number[], eccLength: number): number[] {
  const generator = generatorPolynomial(eccLength);
  const message = data.concat(new Array(eccLength).fill(0));
  for (let i = 0; i < data.length; i += 1) {
    const factor = message[i];
    if (factor === 0) continue;
    const factorLog = glog(factor);
    for (let j = 0; j < generator.length; j += 1) {
      if (generator[j] !== 0) message[i + j] ^= gexp(factorLog + glog(generator[j]));
    }
  }
  return message.slice(message.length - eccLength);
}

class BitBuffer {
  bits: number[] = [];

  put(value: number, length: number) {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push(((value >>> i) & 1) === 1 ? 1 : 0);
  }

  putBytes(values: Uint8Array) {
    for (const value of values) this.put(value, 8);
  }

  toBytes(): number[] {
    const output: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) value |= (this.bits[i + bit] || 0) << (7 - bit);
      output.push(value);
    }
    return output;
  }
}

function createCodewords(text: string): number[] {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_INPUT_BYTES) {
    throw new Error(`QR approval token terlalu panjang (${bytes.length} byte). Maksimal ${MAX_INPUT_BYTES} byte.`);
  }

  const buffer = new BitBuffer();
  buffer.put(0b0100, 4); // Byte mode
  buffer.put(bytes.length, 8); // Version 1-9 character count
  buffer.putBytes(bytes);

  const capacityBits = DATA_CODEWORDS * 8;
  const terminator = Math.min(4, capacityBits - buffer.bits.length);
  for (let i = 0; i < terminator; i += 1) buffer.bits.push(0);
  while (buffer.bits.length % 8 !== 0) buffer.bits.push(0);

  const data = buffer.toBytes();
  let pad = true;
  while (data.length < DATA_CODEWORDS) {
    data.push(pad ? 0xec : 0x11);
    pad = !pad;
  }
  const ecc = calculateEcc(data, ECC_CODEWORDS);
  return data.concat(ecc);
}

function bchDigit(value: number): number {
  let digit = 0;
  let n = value;
  while (n !== 0) {
    digit += 1;
    n >>>= 1;
  }
  return digit;
}

function bchTypeInfo(value: number): number {
  let d = value << 10;
  while (bchDigit(d) - bchDigit(G15) >= 0) d ^= G15 << (bchDigit(d) - bchDigit(G15));
  return ((value << 10) | d) ^ G15_MASK;
}

function maskBit(maskPattern: number, row: number, col: number): boolean {
  switch (maskPattern) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return ((((row * col) % 2) + ((row * col) % 3)) % 2) === 0;
    case 7: return ((((row * col) % 3) + ((row + col) % 2)) % 2) === 0;
    default: return false;
  }
}

function setupFinder(modules: Array<Array<boolean | null>>, row: number, col: number) {
  for (let r = -1; r <= 7; r += 1) {
    if (row + r < 0 || row + r >= MODULE_COUNT) continue;
    for (let c = -1; c <= 7; c += 1) {
      if (col + c < 0 || col + c >= MODULE_COUNT) continue;
      const dark =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      modules[row + r][col + c] = dark;
    }
  }
}

function setupAlignment(modules: Array<Array<boolean | null>>) {
  const positions = [6, 26];
  for (const row of positions) {
    for (const col of positions) {
      if (modules[row][col] !== null) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          modules[row + r][col + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
        }
      }
    }
  }
}

function setupTiming(modules: Array<Array<boolean | null>>) {
  for (let index = 8; index < MODULE_COUNT - 8; index += 1) {
    if (modules[index][6] === null) modules[index][6] = index % 2 === 0;
    if (modules[6][index] === null) modules[6][index] = index % 2 === 0;
  }
}

function setupFormat(modules: Array<Array<boolean | null>>, maskPattern: number) {
  const data = (ERROR_CORRECTION_L << 3) | maskPattern;
  const bits = bchTypeInfo(data);
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    if (i < 6) modules[i][8] = dark;
    else if (i < 8) modules[i + 1][8] = dark;
    else modules[MODULE_COUNT - 15 + i][8] = dark;
  }
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    if (i < 8) modules[8][MODULE_COUNT - i - 1] = dark;
    else if (i < 9) modules[8][15 - i] = dark;
    else modules[8][15 - i - 1] = dark;
  }
  modules[MODULE_COUNT - 8][8] = true;
}

function placeData(modules: Array<Array<boolean | null>>, data: number[], maskPattern: number) {
  let row = MODULE_COUNT - 1;
  let increment = -1;
  let byteIndex = 0;
  let bitIndex = 7;

  for (let col = MODULE_COUNT - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    while (true) {
      for (let c = 0; c < 2; c += 1) {
        const targetCol = col - c;
        if (modules[row][targetCol] !== null) continue;
        let dark = false;
        if (byteIndex < data.length) dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
        if (maskBit(maskPattern, row, targetCol)) dark = !dark;
        modules[row][targetCol] = dark;
        bitIndex -= 1;
        if (bitIndex < 0) {
          byteIndex += 1;
          bitIndex = 7;
        }
      }
      row += increment;
      if (row < 0 || row >= MODULE_COUNT) {
        row -= increment;
        increment = -increment;
        break;
      }
    }
  }
}

function buildMatrix(text: string, maskPattern: number): boolean[][] {
  const modules: Array<Array<boolean | null>> = Array.from(
    { length: MODULE_COUNT },
    () => new Array(MODULE_COUNT).fill(null)
  );
  setupFinder(modules, 0, 0);
  setupFinder(modules, MODULE_COUNT - 7, 0);
  setupFinder(modules, 0, MODULE_COUNT - 7);
  setupAlignment(modules);
  setupTiming(modules);
  setupFormat(modules, maskPattern);
  placeData(modules, createCodewords(text), maskPattern);
  return modules.map((row) => row.map(Boolean));
}

function lostPoint(matrix: boolean[][]): number {
  let score = 0;
  const count = matrix.length;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      let same = 0;
      const dark = matrix[row][col];
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          const r = row + dr;
          const c = col + dc;
          if (r >= 0 && r < count && c >= 0 && c < count && matrix[r][c] === dark) same += 1;
        }
      }
      if (same > 5) score += 3 + same - 5;
    }
  }
  for (let row = 0; row < count - 1; row += 1) {
    for (let col = 0; col < count - 1; col += 1) {
      const total = Number(matrix[row][col]) + Number(matrix[row + 1][col]) + Number(matrix[row][col + 1]) + Number(matrix[row + 1][col + 1]);
      if (total === 0 || total === 4) score += 3;
    }
  }
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count - 6; col += 1) {
      if (matrix[row][col] && !matrix[row][col + 1] && matrix[row][col + 2] && matrix[row][col + 3] && matrix[row][col + 4] && !matrix[row][col + 5] && matrix[row][col + 6]) score += 40;
    }
  }
  for (let col = 0; col < count; col += 1) {
    for (let row = 0; row < count - 6; row += 1) {
      if (matrix[row][col] && !matrix[row + 1][col] && matrix[row + 2][col] && matrix[row + 3][col] && matrix[row + 4][col] && !matrix[row + 5][col] && matrix[row + 6][col]) score += 40;
    }
  }
  let darkCount = 0;
  for (const row of matrix) for (const value of row) if (value) darkCount += 1;
  score += Math.abs(100 * darkCount / (count * count) - 50) / 5 * 10;
  return score;
}

export function createQrMatrix(text: string): boolean[][] {
  let best: boolean[][] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
    const matrix = buildMatrix(text, mask);
    const score = lostPoint(matrix);
    if (score < bestScore) {
      best = matrix;
      bestScore = score;
    }
  }
  if (!best) throw new Error('QR matrix could not be generated.');
  return best;
}
