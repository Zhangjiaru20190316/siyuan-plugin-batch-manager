/* 生成 preview.png（640x360）：纯 Node 手写 PNG，无外部依赖 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const W = 640, H = 360;

// 主题色（取思源默认蓝）
const bg = [48, 48, 48];
const panel = [62, 62, 62];
const bar = [35, 130, 220];
const light = [235, 235, 235];
const red = [202, 82, 82];
const green = [96, 176, 96];

// 每行 RGB
function buildRaw() {
    const rows = [];
    for (let y = 0; y < H; y++) {
        const row = Buffer.alloc(1 + W * 3);
        row[0] = 0; // filter none
        for (let x = 0; x < W; x++) {
            let c = bg;
            // 顶栏条
            if (y < 64) c = panel;
            if (y >= 20 && y < 28 && x >= 20 && x < 44) c = bar;      // 顶栏图标块
            if (y >= 34 && y < 38 && x >= 20 && x < 200) c = [90, 90, 90]; // 工具栏线
            if (y >= 46 && y < 52 && x >= 20 && x < 90) c = bar;      // 筛选按钮
            // 左侧栏
            if (y >= 64 && x < 170) c = panel;
            for (let i = 0; i < 5; i++) {
                const ry = 84 + i * 30;
                if (y >= ry && y < ry + 14 && x >= 16 && x < 150) c = i === 1 ? bar : [88, 88, 88];
            }
            // 表头
            if (y >= 64 && y < 88 && x >= 170) c = [58, 58, 58];
            // 数据行 + 勾选框
            if (y >= 88 && x >= 170) {
                const ri = Math.floor((y - 88) / 34);
                if (ri < 7) {
                    c = ri % 2 ? [55, 55, 55] : [52, 52, 52];
                    const by = 88 + ri * 34 + 12;
                    if (y >= by && y < by + 12 && x >= 182 && x < 194) c = light; // checkbox
                    if (y >= by + 3 && y < by + 9 && x >= 185 && x < 191) c = [52, 52, 52];
                    if (y >= by + 1 && y < by + 4 && x >= 186 && x < 188 + 3) c = [52, 52, 52];
                    if (y >= by + 2 && y < by + 5 && x >= 186 && x < 194 - 4) c = [52, 52, 52];
                }
            }
            // 行内文字模拟条
            if (y >= 88 && x >= 210) {
                const ri = Math.floor((y - 88) / 34);
                if (ri < 7) {
                    const by = 88 + ri * 34 + 14;
                    if (y >= by && y < by + 5) {
                        if (x >= 210 && x < 360) c = [150, 150, 150];
                        if (x >= 420 && x < 520) c = [120, 120, 120];
                        if (x >= 560 && x < 610) c = [120, 120, 120];
                    }
                }
            }
            // 底部操作按钮：导出/移动/重命名（蓝）、删除（红）
            if (y >= H - 44) {
                const btns = [[190, 260, bar], [270, 340, bar], [350, 430, bar], [440, 510, red]];
                for (const [x0, x1, cc] of btns) {
                    if (x >= x0 && x < x1 && y >= H - 40 && y < H - 16) c = cc;
                }
            }
            row.writeUInt8(c[0], 1 + x * 3);
            row.writeUInt8(c[1], 1 + x * 3 + 1);
            row.writeUInt8(c[2], 1 + x * 3 + 2);
        }
        rows.push(row);
    }
    return Buffer.concat(rows);
}

function crc32(buf) {
    let table = crc32.table;
    if (!table) {
        table = crc32.table = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type truecolor
const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(buildRaw())),
    chunk("IEND", Buffer.alloc(0)),
]);
const out = path.resolve(__dirname, "..", "preview.png");
fs.writeFileSync(out, png);
console.log("preview.png written:", out, png.length, "bytes");
