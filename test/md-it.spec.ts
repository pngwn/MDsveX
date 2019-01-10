import path from 'path';
import { load } from 'markdown-it-testgen';
const _ = require('lodash');
const p = require('path');

// these are some markdown-it tests to ensure that I haven't broken anything
// I've probably broken something else instead

function generate(path, md) {
  let options: any = {};

  options = _.assign({}, options);
  options.assert = options.assert || require('chai').assert;

  load(path, options, data => {
    data.meta = data.meta || {};

    const desc = data.meta.desc || p.relative(path, data.file);

    (data.meta.skip ? describe.skip : describe)(desc, () => {
      data.fixtures.forEach(fixture => {
        it(
          fixture.header && options.header
            ? fixture.header
            : 'line ' + (fixture.first.range[0] - 1),
          () => {
            options.assert.strictEqual(
              md({ content: fixture.first.text, filename: 'file.svexy' }).code,
              fixture.second.text
            );
          }
        );
      });
    });
  });
}

describe('markdown-it', () => {
  const md = require('../src/parse').mdsvex({
    markdownOptions: {
      html: true,
      langPrefix: '',
      typographer: true,
      linkify: true,
    },
  }).markup;

  generate(path.join(__dirname, './fixtures/markdown-it'), md);
});
