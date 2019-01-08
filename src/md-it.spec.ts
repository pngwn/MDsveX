import path from 'path';
import generate from 'markdown-it-testgen';

// these are some markdown-it tests to ensure that I haven't broken anything
// I've probably broken something else instead

describe('markdown-it', function() {
  var md = require('./parse').markdownParser({
    html: true,
    langPrefix: '',
    typographer: true,
    linkify: true,
  });

  generate(path.join(__dirname, 'fixtures/markdown-it'), md);
});
