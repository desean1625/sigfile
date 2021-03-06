/**
 * @license apache-2.0
 * @file bluefile.js
 * Copyright (c) 2012-2020, LGS Innovations Inc., All rights reserved.
 *
 * This file is part of SigFile.
 *
 * Licensed to the LGS Innovations (LGS) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  LGS licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import BitArray from './bitarray';
import { BaseFileReader } from './basefilereader';
import { endianness, ab2str, getInt64 } from './util';

/**
 * Bluefiles are a binary format directly supported by SigPlot.  A Bluefile consists of a 512-byte header
 * followed by binary data.
 *
 * For more information on BLUEFILES, please visit http://nextmidas.techma.com/nm/htdocs/usersguide/BlueFiles.html
 *
 * | Offset  |  Name      | Size |  Type      | Description                                |
 * |:--------|:-----------|:-----|:-----------|:-------------------------------------------|
 * |  0      |  version   | 4    |  char[4]   | Header version                             |
 * |  4      |  head_rep  | 4    |  char[4]   | Header representation                      |
 * |  8      |  data_rep  | 4    |  char[4]   | Data representation                        |
 * | 12      |  detached  | 4    |  int_4     | Detached header                            |
 * | 16      |  protected | 4    |  int_4     | Protected from overwrite                   |
 * | 20      |  pipe      | 4    |  int_4     | Pipe mode (N/A)                            |
 * | 24      |  ext_start | 4    |  int_4     | Extended header start, in 512-byte blocks  |
 * | 28      |  ext_size  | 4    |  int_4     | Extended header size in bytes              |
 * | 32      |  data_start| 8    |  real_8    | Data start in bytes                        |
 * | 40      |  data_size | 8    |  real_8    | Data size in bytes                         |
 * | 48      |  type      | 4    |  int_4     | File type code                             |
 * | 52      |  format    | 2    |  char[2]   | Data format code                           |
 * | 54      |  flagmask  | 2    |  int_2     | 16-bit flagmask (1=flagbit)                |
 * | 56      |  timecode  | 8    |  real_8    | Time code field                            |
 * | 64      |  inlet     | 2    |  int_2     | Inlet owner                                |
 * | 66      |  outlets   | 2    |  int_2     | Number of outlets                          |
 * | 68      |  outmask   | 4    |  int_4     | Outlet async mask                          |
 * | 72      |  pipeloc   | 4    |  int_4     | Pipe location                              |
 * | 76      |  pipesize  | 4    |  int_4     | Pipe size in bytes                         |
 * | 80      |  in_byte   | 8    |  real_8    | Next input byte                            |
 * | 88      |  out_byte  | 8    |  real_8    | Next out byte (cumulative)                 |
 * | 96      |  outbytes  | 64   |  real_8[8] | Next out byte (each outlet)                |
 * | 160     |  keylength | 4    |  int_4     | Length of keyword string                   |
 * | 164     |  keywords  | 92   |  char[92]  | User defined keyword string                |
 * | 256     |  Adjunct   | 256  |  char[256] | Type-specific adjunct union (See below for 1000 and 2000 type bluefiles)|
 *
 *
 * Type-1000 Adjunct
 *
 * | Offset | Name | Size | Type | Description                      |
 * :--------|:-----|:-----|:-----|:---------------------------------|
 * |  0     |xstart| 8    |real_8| Abscissa value for first sample  |
 * |  8     |xdelta| 8    |real_8| Abscissa interval between samples|
 * | 16     |xunits| 4    | int_4| Units for abscissa values        |
 *
 * Type-2000 Adjunct
 *
 * | Offset | Name  | Size | Type | Description                          |
 * |:-------|:------|:-----|:-----|:-------------------------------------|
 * |  0     |xstart |  8   |real_8| Frame (column) starting value        |
 * |  8     |xdelta |  8   |real_8| Increment between samples in frame   |
 * | 16     |xunits |  4   |int_4 | Frame (column) units                 |
 * | 20     |subsize|  4   |int_4 | Number of data points per frame (row)|
 * | 24     |ystart |  8   |real_8| Abscissa (row) start                 |
 * | 32     |ydelta |  8   |real_8| Increment between frames             |
 * | 36     |yunits |  4   |int_4 | Abscissa (row) unit code             |
 */
class BlueHeader {
  /**
   * Static member that indicates the endianness of the system,
   * BlueHeader.ARRAY_BUFFER_ENDIANNESS.
   * @memberOf BlueHeader
   * @type {string}
   */
  static ARRAY_BUFFER_ENDIANNESS = endianness();

  /**
   * Mapping from character to
   * @memberOf BlueHeader
   */
  static _SPA = {
    S: 1,
    C: 2,
    V: 3,
    Q: 4,
    M: 9,
    X: 10,
    T: 16,
    U: 1,
    '1': 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
  };

  /**
   * @memberOf bluefile
   */
  static _BPS = {
    P: 0.125,
    A: 1,
    O: 1,
    B: 1,
    I: 2,
    L: 4,
    X: 8,
    F: 4,
    D: 8,
  };

  /**
   * @memberOf bluefile
   */
  static _XM_TO_TYPEDARRAY = {
    P: BitArray,
    A: null,
    O: Uint8Array,
    B: Int8Array,
    I: Int16Array,
    L: Int32Array,
    X: null,
    F: Float32Array,
    D: Float64Array,
  };

  /**
   * @memberOf bluefile
   */
  static _XM_TO_DATAVIEW = {
    P: null,
    A: null,
    O: 'getUint8',
    B: 'getInt8',
    I: 'getInt16',
    L: 'getInt32',
    X: getInt64,
    F: 'getFloat32',
    D: 'getFloat64',
  };

  /**
   * Constructor for a BlueHeader that extracts parameters from the 512-byte
   * Bluefile binary header.  If the data segment of the bluefile is also
   * included in the provided buffer it will be accessible as well
   * via the dview property.
   *
   * @memberof bluefile
   * @param {(ArrayBuffer|array)} buf - An existing ArrayBuffer of Bluefile data.
   * @param {object?} options - options that affect how the bluefile is read
   * @param {string} [options.ext_header_type="dict"] - if the BlueFile contains
   *       extended header keywords, extract them either as a dictionary
   *       ("dict", "json", {}, "XMTable", "JSON", "DICT") or as a list of
   *       key value pairs.  The extended header keywords
   *       will be accessible on the hdr.ext_header property
   *       after the file has been read.
   *
   * See http://nextmidas.techma.com/nm/nxm/sys/docs/MidasBlueFileFormat.pdf for
   * more details on header properties.
   *
   * @property {ArrayBuffer} buf
   * @property {object} options
   * @property {String} version - the header version extracted from the file, always 'BLUE'
   * @property {String} headrep - endianness of header 'IEEE' or 'EEEI'
   * @property {String} datarep - endianness of data 'IEEE' or 'EEEI'
   * @property {Number} ext_start - byte offset for extended header binary data
   * @property {Number} ext_size - byte size for extended header data
   * @property {Number} type - the BLUEFILE type (1000 = 1-D data, 2000 = 2-D data)
   * @property {Number} class - the BLUEFILE class (i.e. type/1000)
   * @property {String} format - the BLUEFILE format, the format is a two character diagraph, such as SF.
   * @property {Number} timecode - absolute time reference for the file (in seconds since Jan 1st 1950)
   * @property {Number} xstart - relative offset for the first sample on the x-axis
   * @property {Number} xdelta - delta between points on the x-axis
   * @property {Number} xunits - the unitcode for the x-axis (see m.UNITS)
   * @property {Number} ystart - relative offset for the first sample on the y-axis
   * @property {Number} ydelta - delta between points on the y-axis
   * @property {Number} yunits - the unitcode for the y-axis (see m.UNITS)
   * @property {Number} subsize - the number of columns for a 2-D data file
   * @property {Number} data_start - byte offset for data
   * @property {Number} data_size - byte size for data
   * @property {Object} ext_header - extracted extended header keywords
   * @property {Number} spa - scalars per atom
   * @property {Number} bps - bytes per scalar
   * @property {Number} bpa - bytes per atom
   * @property {Number} ape - atoms per element
   * @property {Number} bpe - bytes per element
   * @property {Number} size - number of elements in dview
   * @property {DataView} dview - a Data
   * @see {@link http://nextmidas.techma.com/nm/nxm/sys/docs/MidasBlueFileFormat.pdf}
   */
  constructor(buf, options) {
    if (options === undefined) {
      options = {};
    }
    this.options = Object.assign({ ext_header_type: 'dict' }, options);
    this.buf = buf;
    if (this.buf != null) {
      // Parse the header and keywords
      this.setHeader();
      const ds = this.data_start;
      const de = this.data_start + this.data_size;

      // Parse the data
      this.setData(this.buf, ds, de, this.littleEndianData);
    }
  }

  /**
   * Internal method to parse the 512 byte header
   * and unpack the extended header keywords
   *
   * @memberOf BlueHeader
   * @private
   */
  setHeader() {
    const dvhdr = new DataView(this.buf);
    this.version = ab2str(this.buf.slice(0, 4));
    this.headrep = ab2str(this.buf.slice(4, 8));
    this.datarep = ab2str(this.buf.slice(8, 12));
    const littleEndianHdr = this.headrep === 'EEEI';
    this.littleEndianData = this.datarep === 'EEEI';
    this.ext_start = dvhdr.getInt32(24, littleEndianHdr);
    this.ext_size = dvhdr.getInt32(28, littleEndianHdr);
    this.type = dvhdr.getUint32(48, littleEndianHdr);
    this['class'] = this.type / 1000;
    this.format = ab2str(this.buf.slice(52, 54));
    this.timecode = dvhdr.getFloat64(56, littleEndianHdr);
    // the adjunct starts at offset 0x100
    if (this['class'] === 1) {
      this.xstart = dvhdr.getFloat64(0x100, littleEndianHdr);
      this.xdelta = dvhdr.getFloat64(0x100 + 8, littleEndianHdr);
      this.xunits = dvhdr.getInt32(0x100 + 16, littleEndianHdr);
      this.yunits = dvhdr.getInt32(0x100 + 40, littleEndianHdr);
      this.subsize = 1;
    } else if (this['class'] === 2) {
      this.xstart = dvhdr.getFloat64(0x100, littleEndianHdr);
      this.xdelta = dvhdr.getFloat64(0x100 + 8, littleEndianHdr);
      this.xunits = dvhdr.getInt32(0x100 + 16, littleEndianHdr);
      this.subsize = dvhdr.getInt32(0x100 + 20, littleEndianHdr);
      this.ystart = dvhdr.getFloat64(0x100 + 24, littleEndianHdr);
      this.ydelta = dvhdr.getFloat64(0x100 + 32, littleEndianHdr);
      this.yunits = dvhdr.getInt32(0x100 + 40, littleEndianHdr);
    }
    this.data_start = dvhdr.getFloat64(32, littleEndianHdr);
    this.data_size = dvhdr.getFloat64(40, littleEndianHdr);
    if (this.ext_size) {
      this.ext_header = this.unpack_keywords(
        this.buf,
        this.ext_size,
        this.ext_start * 512,
        littleEndianHdr
      );
    }
  }

  /**
   * Internal method that sets the dview up based off the
   * provided buffer and fields extracted from the header.
   *
   * @private
   * @memberOf BlueHeader
   * @param {(ArrayBuffer|array)} buf
   * @param {number} offset
   * @param {number} data_end
   * @param {boolean?} littleEndian
   */
  setData(buf, offset, data_end, littleEndian) {
    if (littleEndian === undefined) {
      littleEndian = BlueHeader.ARRAY_BUFFER_ENDIANNESS === 'LE';
    }

    this.spa = BlueHeader._SPA[this.format[0]];
    this.bps = BlueHeader._BPS[this.format[1]];
    this.bpa = this.spa * this.bps;

    // atoms per element (ape) differs between
    // type 1000 and type 2000
    if (this['class'] === 1) {
      this.ape = 1;
    } else if (this['class'] === 2) {
      this.ape = this.subsize;
    }

    this.bpe = this.ape * this.bpa;

    // TODO handle mismatch between host and data endianness using arrayBufferEndianness
    const arrayBufferLittleEndian = BlueHeader.ARRAY_BUFFER_ENDIANNESS === 'LE';
    const arrayBufferBigEndian = BlueHeader.ARRAY_BUFFER_ENDIANNESS === 'BE';
    if (
      (arrayBufferLittleEndian && !littleEndian) ||
      (arrayBufferBigEndian && this.littleEndianData)
    ) {
      throw `Not supported ${BlueHeader.ARRAY_BUFFER_ENDIANNESS} ${littleEndian}`;
    }
    if (buf) {
      if (offset && data_end) {
        const length = (data_end - offset) / this.bps;
        this.dview = this.createArray(buf, offset, length);
      } else {
        this.dview = this.createArray(buf);
      }
      this.size = this.dview.length / (this.spa * this.ape);
    } else {
      this.dview = this.createArray(null, null, this.size);
    }
  }

  /**
   * Internal method that unpacks the extended header keywords into
   * either a object (i.e. dictionary) or a list of key-value pairs
   * depending on this.options.ext_header_type.
   *
   * @author Sean Sullivan https://github.com/desean1625
   * @private
   * @memberOf BlueHeader
   * @param {ArrayBuffer} buf - Buffer where the keywords are located
   * @param {number} lbuf - Size of the extended header
   * @param {number} offset - Offset from the extended header
   * @param {boolean} littleEndian - Whether or not to parse as little endian
   * @return {object|Array} Parsed keywords as an object from the header
   */
  unpack_keywords(buf, lbuf, offset, littleEndian) {
    var lkey, lextra, ltag, format, tag, data, ldata, itag, idata;
    var keywords = [];
    var dic_index = {};
    var dict_keywords = {};
    var ii = 0;
    buf = buf.slice(offset, offset + lbuf);
    var dvhdr = new DataView(buf);
    buf = ab2str(buf);
    while (ii < lbuf) {
      idata = ii + 8;
      lkey = dvhdr.getUint32(ii, littleEndian);
      lextra = dvhdr.getInt16(ii + 4, littleEndian);
      ltag = dvhdr.getInt8(ii + 6, littleEndian);
      format = buf.slice(ii + 7, ii + 8);
      ldata = lkey - lextra;
      itag = idata + ldata;
      tag = buf.slice(itag, itag + ltag);
      if (format === 'A') {
        data = buf.slice(idata, idata + ldata);
      } else {
        if (BlueHeader._XM_TO_DATAVIEW[format]) {
          var reader;
          if (typeof BlueHeader._XM_TO_DATAVIEW[format] === 'string') {
            reader = (index) => {
              return dvhdr[BlueHeader._XM_TO_DATAVIEW[format]](
                index,
                littleEndian
              );
            };
          } else {
            reader = (index) => {
              return BlueHeader._XM_TO_DATAVIEW[format](
                dvhdr,
                index,
                littleEndian
              );
            };
          }
          let values = [];
          for (let index = 0; index < ldata; index += BlueHeader._BPS[format]) {
            values.push(reader(index + idata));
          }
          if (values.length === 1) {
            data = values[0];
          } else {
            data = values;
          }
        } else {
          window.console.info(
            'Unsupported keyword format ' + format + ' for tag ' + tag
          );
        }
      }
      if (typeof dic_index[tag] === 'undefined') {
        dic_index[tag] = 1;
      } else {
        dic_index[tag]++;
        tag = '' + tag + dic_index[tag];
      }
      dict_keywords[tag] = data;
      keywords.push({ tag: tag, value: data });
      ii += lkey;
    }
    var dictTypes = ['dict', 'json', {}, 'XMTable', 'JSON', 'DICT'];
    const ext_header_type = this.options.ext_header_type;
    // Added because {} === {} is `false` in JS
    if (
      typeof ext_header_type === 'object' &&
      ext_header_type !== null &&
      Object.keys(ext_header_type).length === 0 &&
      ext_header_type.constructor === Object
    ) {
      return dict_keywords;
    }
    for (var k in dictTypes) {
      if (dictTypes[k] === this.options.ext_header_type) {
        return dict_keywords;
      }
    }
    return keywords;
  }

  /**
   * Internal method to create typed array for the data based on the
   * format extracted from the header.
   *
   * @private
   * @memberOf BlueHeader
   * @param buf
   * @param offset
   * @param length
   * @returns {array}
   */
  createArray(buf, offset, length) {
    const TypedArray = BlueHeader._XM_TO_TYPEDARRAY[this.format[1]];
    if (TypedArray === undefined) {
      throw `unknown format ${this.format[1]}`;
    }
    // backwards compatibility with some implementations of typed array
    // requires this
    if (offset === undefined) {
      offset = 0;
    }
    if (length === undefined) {
      length = buf.length || buf.byteLength / BlueHeader._BPS[this.format[1]];
    }
    let result;
    if (buf) {
      if (Array.isArray(buf) && Array.isArray(buf[0])) {
        // Flatten 2-D array into 1-D
        buf = [].concat.apply([], buf);
        length = buf.length * buf[0].length;
        result = new TypedArray(buf, offset, length);
      } else if (Array.isArray(buf) && ArrayBuffer.isView(buf[0])) {
        // Flatten 2-D array of TypedArrays
        length = buf.length * buf[0].length;
        result = new TypedArray(length);
        for (let ii = 0; ii < buf.length; ++ii) {
          result.set(buf[ii], ii * buf[0].length);
        }
      } else {
        // basic 1-D array
        result = new TypedArray(buf, offset, length);
      }
    } else {
      // no initial data
      result = new TypedArray(length);
    }
    return result;
  }
}

/**
 * @extends BaseFileReader
 */
class BlueFileReader extends BaseFileReader {
  /**
   * Bluefile Reader constructor.
   *
   * @memberof bluefile
   * @param {object?} options - options that affect how the bluefile is read
   * @param {string} options.ext_header_type="dict"
   *       if the BlueFile contains extended header keywords,
   *       extract them either as a dictionary ("dict", "json",
   *       {}, "XMTable", "JSON", "DICT") or as a list of
   *       key value pairs.  The extended header keywords
   *       will be accessible on the hdr.ext_header property
   *       after the file has been read.
   */
  constructor(options) {
    super(BlueHeader, options);
  }
}

export { BlueHeader, BlueFileReader };
