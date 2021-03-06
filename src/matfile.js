/**
 * @license
 * File: matfile.js
 * Copyright (c) 2012-2017, LGS Innovations Inc., All rights reserved.
 *
 * This file is part of SigPlot.
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
import { BaseFileReader } from './basefilereader';
import { endianness, ab2str, getInt64 } from './util';

/**
 * MAT-files are a binary format directly supported by SigPlot.  A MAT-file consists of a 132-byte header
 * followed by binary data.
 * For more information on MAT-files, please visit https://www.mathworks.com/help/pdf_doc/matlab/matfile_format.pdf
 *
 * | Offset | Name        | Size |    Type    |    Description |
 * |--------|:------------|:-----|:-----------|:---------------|
 * | 0      | header      | 115  |  char[115] |    Header      |
 * | 116    | subsys      |   7  |  char[7]   |                |
 * | 124    | version     |   2  |  int_2     |                |
 * | 126    | endianness  |   2  |  char[2]   |                |
 * | 128    | data_offset |   4  |  int_4     |                |
 * | 132    | byte_offset |   4  |  int_4     |                |
 */
class MatHeader {
  /**
   * @memberOf matfile
   * @private
   */
  static ARRAY_BUFFER_ENDIANNESS = endianness(); // eslint-disable-line no-unused-vars

  /**
   * @memberOf matfile
   * @private
   */
  static versionNames = { 256: 'MAT-file' };

  /**
   * @memberOf matfile
   * @private
   */
  static _MAT_TO_TYPEDARRAY = {
    miINT8: Int8Array,
    miUINT8: Uint8Array,
    miInt16: Int16Array,
    miUINT16: Uint16Array,
    miINT32: Int32Array,
    miUINT32: Uint32Array,
    miDOUBLE: Float64Array,
  };

  static _MAT_TO_DATAVIEW = {
    miINT8: 'getInt8',
    miUINT8: 'getUint8',
    miINT16: 'getInt16',
    miUINT16: 'getUint16',
    miINT32: 'getInt32',
    miUINT32: 'getUint32',
    miSINGLE: 'getFloat32',
    miDOUBLE: 'getFloat64',
    miINT64: getInt64,
    /* TODO: "miUINT64", "miMATRIX", "miCOMPRESSED"
             "miUTF8", "miUTF16", "miUTF32" */
  };

  /**
   * @memberOf matfile
   * @private
   */
  static dataTypeNames = {
    1: {
      name: 'miINT8',
      size: 1,
    },
    2: {
      name: 'miUINT8',
      size: 1,
    },
    3: {
      name: 'miINT16',
      size: 2,
    },
    4: {
      name: 'miUINT16',
      size: 2,
    },
    5: {
      name: 'miINT32',
      size: 4,
    },
    6: {
      name: 'miUINT32',
      size: 4,
    },
    7: {
      name: 'miSINGLE',
      size: 4,
    },
    // 8 is reserved
    9: {
      name: 'miDOUBLE',
      size: 8,
    },
    // 10 and 11 are reserved
    12: {
      name: 'miINT64',
      size: 8,
    },
    13: {
      name: 'miUINT64',
      size: 8,
    },
    14: {
      name: 'miMATRIX',
      size: null,
    },
    15: {
      name: 'miCOMPRESSED',
      size: null,
    },
    16: {
      name: 'miUTF8',
      size: null,
    },
    17: {
      name: 'miUTF16',
      size: null,
    },
    18: {
      name: 'miUTF32',
      size: null,
    },
  };

  /**
   * @memberOf matfile
   * @private
   */
  static arrayClassNames = {
    1: 'mxCELL_CLASS',
    2: 'mxSTRUCT_CLASS',
    3: 'mxOBJECT_CLASS',
    4: 'mxCHAR_CLASS',
    5: 'mxSPARSE_CLASS',
    6: 'mxDOUBLE_CLASS',
    7: 'mxSINGLE_CLASS',
    8: 'mxINT8_CLASS',
    9: 'mxUINT8_CLASS',
    10: 'mxINT16_CLASS',
    11: 'mxUINT16_CLASS',
    12: 'mxINT32_CLASS',
    13: 'mxUINT32_CLASS',
    14: 'mxINT64_CLASS',
    15: 'mxUINT64_CLASS',
  };

  /**
   * Descriptive text field
   *
   * @memberOf matfile
   * @private
   */
  static headerTextBegin = 1;
  static headerTextEnd = 116;

  /**
   * Subsystem data offset field
   *
   * @memberOf matfile
   * @private
   */
  static subsysOffsetBegin = 117;
  static subsysOffsetEnd = 124;

  /**
   * Version field
   */
  static versionOffsetBegin = 125;
  static versionOffsetEnd = 126;

  // Two character endian indicator. If the value reads "MI" then native computer
  // has written the file in Big Endian, so no byte translation must occur.
  // If value reads "IM" then native computer has written the file in Little Endian
  // so byte-wise translation must be used on all data elements larger than 1 byte.
  static endianCharsBegin = 127;
  static endianCharsEnd = 128;

  /**
   * Outermost data type and number of bytes. For data plottable in SigPlot this will
   * most likely be a 1D array. The associated MATLAB type will most likely be "miMATRIX".
   */

  /**
   * WARNING: type "miCOMPRESSED" is the default for MATLAB files above version 6. These
   * compressed files are currently UNREADABLE by this program as the file must be
   * decompressed before reading.
   */
  static firstDataTypeOffsetBegin = 129;
  static firstDataTypeOffsetEnd = 132;

  static numBytesOffsetBegin = 133;
  static numBytesOffsetEnd = 136;

  /**
   * Create matfile header and attach data buffer
   * @memberOf MatHeader
   * @param {array} buf - Data bffer
   */
  constructor(buf) {
    this.file = null;
    this.file_name = null;
    this.buf = buf;
    if (this.buf != null) {
      const dvhdr = new DataView(this.buf);
      this.headerStr = ab2str(
        this.buf.slice(MatHeader.headerTextBegin - 1, MatHeader.headerTextEnd)
      );

      // get endianness
      this.datarep = ab2str(
        this.buf.slice(MatHeader.endianCharsBegin - 1, MatHeader.endianCharsEnd)
      );
      const littleEndianHdr = this.datarep === 'IM';
      const littleEndianData = this.datarep === 'IM';

      this.headerList = this.headerStr.split(',').map(function (str) {
        return str.trim();
      });
      this.matfile = this.headerList[0];
      this.platform = this.headerList[1];
      this.createdOn = this.headerList[2];
      this.subsystemOffset = ab2str(
        this.buf.slice(
          MatHeader.subsysOffsetBegin - 1,
          MatHeader.subsysOffsetEnd
        )
      );
      this.version = dvhdr.getUint16(
        MatHeader.versionOffsetBegin - 1,
        littleEndianHdr
      );
      this.versionName = MatHeader.versionNames[this.version];

      this.dataType = dvhdr.getUint32(
        MatHeader.firstDataTypeOffsetBegin - 1,
        littleEndianHdr
      );
      this.dataTypeName = MatHeader.dataTypeNames[this.dataType].name;
      this.arraySize = dvhdr.getUint32(
        MatHeader.numBytesOffsetBegin - 1,
        littleEndianHdr
      );

      const beginArray = MatHeader.numBytesOffsetEnd + 1; // eslint-disable-line no-unused-vars

      // Start reading the file linearly from beginning and inc index as you go...
      let currIndex = MatHeader.numBytesOffsetEnd + 1;
      const typeNum = dvhdr.getUint32(currIndex - 1, littleEndianHdr);
      const typeName = MatHeader.dataTypeNames[typeNum].name;
      const typeSize = MatHeader.dataTypeNames[typeNum].size;
      currIndex += 4;

      // bytes per ``typeName``
      const _flagLength = this.getDataWithType(
        dvhdr,
        typeName,
        currIndex - 1,
        littleEndianData
      );
      currIndex += typeSize;

      // Array flags
      // If bit is set:
      // - complex: the data element includes an imaginary part
      // - global: "MATLAB loads the data element as a global variable in the base workspace"
      // - logical: indicates the array is used for logical indexing.
      const arrayFlag = this.getDataWithType(
        dvhdr,
        typeName,
        currIndex - 1,
        littleEndianData
      );
      currIndex += typeSize;

      // TODO: use flags for future implementation
      const _complexFlag = arrayFlag & 0x80;
      const _globalFlag = arrayFlag & 0x40;
      const _logicalFlag = arrayFlag & 0x20;

      // Find array class
      const arrayClassNum = arrayFlag & 0xf;
      const _arrayClassName = MatHeader.arrayClassNames[arrayClassNum];

      // TODO: sparse array data format implementation: which uses next 4 bytes
      //       Skip to next type field (array dimensions)
      currIndex += typeSize;

      // Dimensions type:
      const dimTypeNum = dvhdr.getUint32(currIndex - 1, littleEndianData);
      currIndex += 4;

      const dimTypeName = MatHeader.dataTypeNames[dimTypeNum].name;
      const dimTypeSize = MatHeader.dataTypeNames[dimTypeNum].size;

      // Dimensions size:
      const _arrayDimTotalSize = dvhdr.getUint32(
        currIndex - 1,
        littleEndianData
      );
      currIndex += 4;

      // Get number of rows
      const rows = this.getDataWithType(
        dvhdr,
        dimTypeName,
        currIndex - 1,
        littleEndianData
      );
      currIndex += dimTypeSize;

      // TODO: support for >= 2D array types
      if (rows > 1) {
        console.warn('Only 1D arrays are currently supported.');
      }

      // Get number of columns
      const _cols = this.getDataWithType(
        dvhdr,
        dimTypeName,
        currIndex - 1,
        littleEndianData
      );
      currIndex += typeSize;

      // array name type
      let arrayNameTypeNum = dvhdr.getUint32(currIndex - 1, littleEndianData);
      currIndex += 4;

      let nameSize = 0;
      let small = false;
      if (arrayNameTypeNum > 15) {
        arrayNameTypeNum &= 0x00ff;
        small = true;
        nameSize = dvhdr.getUint16(currIndex - 5, littleEndianData);
      }

      const arrayNameTypeName = MatHeader.dataTypeNames[arrayNameTypeNum].name;
      const _arrayNameTypeSize = MatHeader.dataTypeNames[arrayNameTypeNum].size;

      if (!small) {
        nameSize = this.getDataWithType(
          dvhdr,
          arrayNameTypeName,
          currIndex - 1,
          littleEndianData
        );
        currIndex += 4;
      }

      // Pad to end of 64 bit word if necessary
      // If small, we will pad from the middle to the end of a 64 bit word;
      // Otherwise, pat from start of a new word
      const rndUp = small ? (4 - (nameSize % 4)) % 4 : (8 - (nameSize % 8)) % 8;

      const jumpTo = nameSize + rndUp;
      currIndex += jumpTo;

      // set the data field in the header
      this.setData(this.buf, dvhdr, currIndex, littleEndianData);
    }
  }

  /**
   * Get a JS array from MATLAB array
   *
   * @memberOf MatHeader
   * @private
   * @param {ArrayBuffer | Array} buf -
   * @param {number} offset -
   * @param {number} length -
   * @param {string} type -
   */
  createArray(buf, offset, length, type) {
    // TODO: big endian implemenation
    const TypedArray = MatHeader._MAT_TO_TYPEDARRAY[type];
    if (TypedArray === undefined) {
      throw `unknown type ${type}`;
    }

    if (offset === undefined) {
      offset = 0;
    }

    if (length === undefined) {
      length = buf.length; // TODO: Add `|| buf.byteLength / BPS;`
    }

    return new TypedArray(buf, offset, length);
  }

  /**
   *
   * @memberOf MatHeader
   * @param dv
   * @param typeName
   * @param offset
   * @param littleEndian
   * @returns {*}
   */
  getDataWithType(dv, typeName, offset, littleEndian) {
    const typeFunc = MatHeader._MAT_TO_DATAVIEW[typeName];
    if (typeFunc === undefined) {
      throw `Type name ${typeName} is not supported`;
    }
    return dv[typeFunc](offset, littleEndian);
  }

  /**
   *
   * @memberOf MatHeader
   * @param   buf
   * @param   dvhdr
   * @param   currIndex
   * @param   littleEndian
   */
  setData(buf, dvhdr, currIndex, littleEndian) {
    let arrayValSize;

    // Array value(s) type:
    let typeNum = dvhdr.getUint32(currIndex - 1, littleEndian);

    // Check for MATLAB "small element type"
    let small = false;
    if (typeNum > 15) {
      typeNum &= 0x00ff;
      small = true;
      arrayValSize = dvhdr.getUint16(currIndex + 1, 2, littleEndian);
    } else {
      currIndex += 4;
    }

    const typeName = MatHeader.dataTypeNames[typeNum].name;
    const typeSize = MatHeader.dataTypeNames[typeNum].size;

    if (!small) {
      arrayValSize = dvhdr.getUint32(currIndex - 1, littleEndian);
      small = false;
    }

    currIndex += 4;

    // Get JS array from MATLAB array
    this.dview = this.createArray(
      buf,
      currIndex - 1,
      arrayValSize / typeSize,
      typeName
    );
  }
}

class MatFileReader extends BaseFileReader {
  constructor(options) {
    super(options, MatHeader);
  }
}

export { MatHeader, MatFileReader };
