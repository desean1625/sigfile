import 'jest';
import { expect } from 'chai';
import { bluefile } from '../src/index';

const BASE_URL = 'http://localhost:3000/tests/dat';

describe('bluefile.BlueFileReader', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  it('should fail gracefully', (done) => {
    const bfr = new bluefile.BlueFileReader();
    bfr.read_http('foo/bar/baz', (hdr) => {
      expect(hdr).to.be.null;
      done();
    });
  });
  it('should parse type 1000 double data', (done) => {
    const bfr = new bluefile.BlueFileReader();
    bfr.read_http(`${BASE_URL}/sin.tmp`, (hdr) => {
      expect(hdr).to.not.be.null;
      expect(hdr.buf.byteLength).to.equal(33280);
      expect(hdr.dview.length).to.equal(4096);
      expect(hdr.file_name).to.equal('sin.tmp');
      expect(hdr.version).to.equal('BLUE');
      expect(hdr.headrep).to.equal('EEEI');
      expect(hdr.datarep).to.equal('EEEI');
      expect(hdr.timecode).to.equal(0);
      expect(hdr.type).to.equal(1000);
      expect(hdr['class']).to.equal(1);
      expect(hdr.format).to.equal('SD');
      expect(hdr.spa).to.equal(1);
      expect(hdr.bps).to.equal(8);
      expect(hdr.bpa).to.equal(8);
      expect(hdr.ape).to.equal(1);
      expect(hdr.bpe).to.equal(8);
      expect(hdr.size).to.equal(4096);
      expect(hdr.xstart).to.equal(0.0);
      expect(hdr.xdelta).to.equal(1.0);
      expect(hdr.xunits).to.equal(0);
      expect(hdr.subsize).to.equal(1);
      expect(hdr.ystart).to.equal(undefined);
      expect(hdr.ydelta).to.equal(undefined);
      expect(hdr.yunits).to.equal(0);
      expect(hdr.data_start).to.equal(512.0);
      expect(hdr.data_size).to.equal(32768);
      expect(hdr.dview[0]).to.equal(1);
      expect(hdr.dview[1]).to.equal(0.9980267284282716);
      expect(hdr.dview[2]).to.equal(0.9921147013144778);
      expect(hdr.dview[4093]).to.equal(0.9048270524660175);
      expect(hdr.dview[4094]).to.equal(0.9297764858882493);
      expect(hdr.dview[4095]).to.equal(0.9510565162951516);
      done();
    });
  });
  it('should load type 2000 SD data correctly from buffer', (done) => {
    const bfr = new bluefile.BlueFileReader();
    bfr.read_http(`${BASE_URL}/penny.prm`, (hdr) => {
      expect(hdr).to.not.be.null;
      expect(hdr.type).to.equal(2000);
      expect(hdr.format).to.equal('SD');
      expect(hdr.size).to.equal(128);
      expect(hdr.ext_start).to.equal(257);
      expect(hdr.ext_size).to.equal(320);
      expect(hdr.data_start).to.equal(512);
      expect(hdr.data_size).to.equal(131072);
      done();
    });
  });
  it('should parse complex float data', (done) => {
    const bfr = new bluefile.BlueFileReader();
    bfr.read_http(`${BASE_URL}/pulse_cx.tmp`, (hdr) => {
      expect(hdr).to.not.be.null;
      expect(hdr.buf.byteLength).to.equal(131584);
      expect(hdr.dview.length).to.equal(400);
      expect(hdr.file_name).to.equal('pulse_cx.tmp');
      expect(hdr.version).to.equal('BLUE');
      expect(hdr.headrep).to.equal('EEEI');
      expect(hdr.datarep).to.equal('EEEI');
      expect(hdr.timecode).to.equal(0);
      expect(hdr.type).to.equal(1000);
      expect(hdr['class']).to.equal(1);
      expect(hdr.format).to.equal('CF');
      expect(hdr.spa).to.equal(2);
      expect(hdr.bps).to.equal(4);
      expect(hdr.bpa).to.equal(8);
      expect(hdr.ape).to.equal(1);
      expect(hdr.bpe).to.equal(8);
      expect(hdr.size).to.equal(200);
      expect(hdr.xstart).to.equal(0.0);
      expect(hdr.xdelta).to.equal(1.0);
      expect(hdr.xunits).to.equal(1);
      expect(hdr.subsize).to.equal(1);
      expect(hdr.ystart).to.equal(undefined);
      expect(hdr.ydelta).to.equal(undefined);
      expect(hdr.yunits).to.equal(0);
      expect(hdr.data_start).to.equal(512.0);
      expect(hdr.data_size).to.equal(1600);
      done();
    });
  });
  it('should read bluefile ascii keywords from HTTP', (done) => {
    const bfr = new bluefile.BlueFileReader();
    bfr.read_http(`${BASE_URL}/lots_of_keywords.tmp`, (hdr) => {
      expect(hdr).to.not.equal(null);
      let i = 1;
      let strpad = '';
      while (i <= 100) {
        if (i <= 100) {
          strpad = '                                ';
        }
        if (i <= 30) {
          strpad = '                ';
        }
        if (i <= 20) {
          strpad = '';
        }
        let str = '' + i;
        let keypad = '000';
        let ans = keypad.substring(0, keypad.length - str.length) + str;
        let key = 'KEYWORD_' + ans;
        let value = '[value___' + ans + strpad + ']';
        if (i > 50 && i <= 100) {
          value += ' ';
        }
        expect(hdr.ext_header[key]).to.equal(value);
        i++;
      }
      done();
    });
  });
  it('should read all keywords as JSON (default) from HTTP', (done) => {
    const bfr = new bluefile.BlueFileReader(); //defaults are to use dict
    bfr.read_http(`${BASE_URL}/keyword_test_file.tmp`, (hdr) => {
      expect(hdr).to.not.equal(null);
      let keywords = {
        B_TEST: 123,
        I_TEST: 1337,
        L_TEST: 113355,
        X_TEST: 987654321,
        F_TEST: 0.12345000356435776,
        D_TEST: 9.87654321,
        O_TEST: 255,
        STRING_TEST: 'Hello World',
        B_TEST2: 99,
        STRING_TEST2: 'Goodbye World',
      };
      for (let prop in keywords) {
        expect(hdr.ext_header[prop]).to.equal(keywords[prop]);
      }
      done();
    });
  });
  it('should read all keywords as JSON (json) from HTTP', (done) => {
    const bfr = new bluefile.BlueFileReader({
      ext_header_type: 'json',
    });
    bfr.read_http(`${BASE_URL}/keyword_test_file.tmp`, (hdr) => {
      expect(hdr).to.not.equal(null);
      let keywords = {
        B_TEST: 123,
        I_TEST: 1337,
        L_TEST: 113355,
        X_TEST: 987654321,
        F_TEST: 0.12345000356435776,
        D_TEST: 9.87654321,
        O_TEST: 255,
        STRING_TEST: 'Hello World',
        B_TEST2: 99,
        STRING_TEST2: 'Goodbye World',
      };
      for (let prop in keywords) {
        expect(hdr.ext_header[prop]).to.equal(keywords[prop]);
      }
      done();
    });
  });
  it('should read all keywords as JSON (dict) from HTTP', (done) => {
    const bfr = new bluefile.BlueFileReader({
      ext_header_type: 'dict',
    });
    bfr.read_http(`${BASE_URL}/keyword_test_file.tmp`, (hdr) => {
      expect(hdr).to.not.equal(null);
      let keywords = {
        B_TEST: 123,
        I_TEST: 1337,
        L_TEST: 113355,
        X_TEST: 987654321,
        F_TEST: 0.12345000356435776,
        D_TEST: 9.87654321,
        O_TEST: 255,
        STRING_TEST: 'Hello World',
        B_TEST2: 99,
        STRING_TEST2: 'Goodbye World',
      };
      for (let prop in keywords) {
        expect(hdr.ext_header[prop]).to.equal(keywords[prop]);
      }
      done();
    });
  });
  it('should read all keywords as JSON ({}) from HTTP', (done) => {
    const bfr = new bluefile.BlueFileReader({
      ext_header_type: {},
    });
    bfr.read_http(`${BASE_URL}/keyword_test_file.tmp`, (hdr) => {
      expect(hdr).to.not.equal(null);
      let keywords = {
        B_TEST: 123,
        I_TEST: 1337,
        L_TEST: 113355,
        X_TEST: 987654321,
        F_TEST: 0.12345000356435776,
        D_TEST: 9.87654321,
        O_TEST: 255,
        STRING_TEST: 'Hello World',
        B_TEST2: 99,
        STRING_TEST2: 'Goodbye World',
      };
      for (let prop in keywords) {
        expect(hdr.ext_header[prop]).to.equal(keywords[prop], `prop: ${prop}`);
      }
      done();
    });
  });
  it('should read all keywords as Array (list) from HTTP', (done) => {
    const bfr = new bluefile.BlueFileReader({
      ext_header_type: 'list',
    });
    bfr.read_http(`${BASE_URL}/keyword_test_file.tmp`, (hdr) => {
      expect(hdr).to.not.equal(null);
      let keywords = [
        {
          tag: 'B_TEST',
          value: 123,
        },
        {
          tag: 'I_TEST',
          value: 1337,
        },
        {
          tag: 'L_TEST',
          value: 113355,
        },
        {
          tag: 'X_TEST',
          value: 987654321,
        },
        {
          tag: 'F_TEST',
          value: 0.12345000356435776,
        },
        {
          tag: 'D_TEST',
          value: 9.87654321,
        },
        {
          tag: 'O_TEST',
          value: 255,
        },
        {
          tag: 'STRING_TEST',
          value: 'Hello World',
        },
        {
          tag: 'B_TEST2',
          value: 99,
        },
        {
          tag: 'STRING_TEST2',
          value: 'Goodbye World',
        },
      ];
      for (let i = 0; i < keywords.length; i++) {
        expect(hdr.ext_header[i].tag).to.equal(keywords[i].tag);
        expect(hdr.ext_header[i].value).to.equal(keywords[i].value);
      }
      done();
    });
  });
  it('should read all keywords and I_ARRAY_TEST should be an array from HTTP', (done) => {
    const bfr = new bluefile.BlueFileReader({
      ext_header_type: {},
    });
    bfr.read_http(`${BASE_URL}/keyword_int_array_test_file.tmp`, (hdr) => {
      expect(hdr).to.not.equal(null);
      let keywords = {
        I_ARRAY_TEST: [1, 2, 3, 4],
      };
      for (let prop in keywords) {
        expect('' + hdr.ext_header[prop]).to.equal(
          '' + keywords[prop],
          `prop: ${prop}`
        );
      }
      done();
    });
  });
  it('should parse scalar packed data', (done) => {
    const bfr = new bluefile.BlueFileReader();
    bfr.read_http(`${BASE_URL}/scalarpacked.tmp`, (hdr) => {
      expect(hdr).to.not.equal(null);
      expect(hdr.buf.byteLength).to.eql(1024);
      expect(hdr.dview.length).to.eql(8192);
      expect(hdr.file_name).to.eql('scalarpacked.tmp');
      expect(hdr.version).to.eql('BLUE');
      expect(hdr.headrep).to.eql('EEEI');
      expect(hdr.datarep).to.eql('EEEI');
      expect(hdr.timecode).to.eql(0);
      expect(hdr.type).to.eql(1000);
      expect(hdr['class']).to.eql(1);
      expect(hdr.format).to.eql('SP');
      expect(hdr.spa).to.eql(1);
      expect(hdr.bps).to.eql(0.125);
      expect(hdr.bpa).to.eql(0.125);
      expect(hdr.ape).to.eql(1);
      expect(hdr.bpe).to.eql(0.125);
      expect(hdr.size).to.eql(8192);
      expect(hdr.xstart).to.eql(0.0);
      expect(hdr.xdelta).to.eql(1.0);
      expect(hdr.xunits).to.eql(1);
      expect(hdr.subsize).to.eql(1);
      expect(hdr.ystart).to.be.undefined;
      expect(hdr.ydelta).to.be.undefined;
      expect(hdr.yunits).to.eql(0);
      expect(hdr.data_start).to.eql(512.0);
      expect(hdr.data_size).to.eql(128);
      expect(hdr.dview.getBit(0)).to.eql(0);
      expect(hdr.dview.getBit(1)).to.eql(1);
      expect(hdr.dview.getBit(2)).to.eql(0);
      expect(hdr.dview.getBit(3)).to.eql(0);
      expect(hdr.dview.getBit(4)).to.eql(0);
      expect(hdr.dview.getBit(5)).to.eql(0);
      expect(hdr.dview.getBit(6)).to.eql(1);
      expect(hdr.dview.getBit(7)).to.eql(0);
      done();
    });
  });
});
