/* 极简 zip 打包器（deflate），零依赖：entries = [{name, data:Buffer}] */
const zlib = require("zlib");

function crc32(buf) {
    if (!crc32.table) {
        crc32.table = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crc32.table[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (const b of buf) crc = crc32.table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
    const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
    const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
    return {time, date};
}

/** 返回 zip Buffer */
function zipFiles(entries) {
    const {time, date} = dosDateTime();
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const e of entries) {
        const nameBuf = Buffer.from(e.name, "utf8");
        const data = e.data;
        const crc = crc32(data);
        const comp = zlib.deflateRawSync(data, {level: 9});

        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);
        lh.writeUInt16LE(20, 4); // version needed
        lh.writeUInt16LE(0, 6); // flags
        lh.writeUInt16LE(8, 8); // deflate
        lh.writeUInt16LE(time, 10);
        lh.writeUInt16LE(date, 12);
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(comp.length, 18);
        lh.writeUInt32LE(data.length, 22);
        lh.writeUInt16LE(nameBuf.length, 26);
        lh.writeUInt16LE(0, 28);
        locals.push(lh, nameBuf, comp);

        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0);
        ch.writeUInt16LE(20, 4);
        ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(0, 8);
        ch.writeUInt16LE(8, 10);
        ch.writeUInt16LE(time, 12);
        ch.writeUInt16LE(date, 14);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(comp.length, 20);
        ch.writeUInt32LE(data.length, 24);
        ch.writeUInt16LE(nameBuf.length, 28);
        ch.writeUInt16LE(0, 30); // extra
        ch.writeUInt16LE(0, 32); // comment
        ch.writeUInt16LE(0, 34); // disk
        ch.writeUInt16LE(0, 36); // internal attrs
        ch.writeUInt32LE(0, 38); // external attrs
        ch.writeUInt32LE(offset, 42);
        centrals.push(ch, nameBuf);

        offset += 30 + nameBuf.length + comp.length;
    }

    const centralBuf = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...locals, centralBuf, eocd]);
}

/** 收集目录下所有文件为 zip entries（相对路径） */
function dirEntries(rootDir, base = "") {
    const fs = require("fs");
    const path = require("path");
    const out = [];
    for (const name of fs.readdirSync(rootDir)) {
        const p = path.join(rootDir, name);
        const rel = base ? `${base}/${name}` : name;
        if (fs.statSync(p).isDirectory()) out.push(...dirEntries(p, rel));
        else out.push({name: rel, data: fs.readFileSync(p)});
    }
    return out;
}

module.exports = {zipFiles, dirEntries};
