/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * 
 * @format
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.flowImportTo = flowImportTo;

var _hermesParser = require("hermes-parser");

function flowImportTo(ast, _code, _scopeManager, opts) {
  function mapSource(source) {
    const resultValue = opts.sourceMapper({
      module: source.value
    });

    if (resultValue === source.value) {
      return source;
    }

    return _hermesParser.SimpleTransform.nodeWith(source, {
      value: resultValue,
      raw: `"${resultValue}"`
    });
  }

  const result = _hermesParser.SimpleTransform.transform(ast, {
    transform(node) {
      switch (node.type) {
        case 'ImportDeclaration':
          {
            return _hermesParser.SimpleTransform.nodeWith(node, {
              source: mapSource(node.source)
            });
          }

        case 'DeclareExportAllDeclaration':
        case 'ExportAllDeclaration':
        case 'DeclareExportDeclaration':
        case 'ExportNamedDeclaration':
          {
            if (node.source != null) {
              return _hermesParser.SimpleTransform.nodeWith(node, {
                source: mapSource(node.source)
              });
            }

            return node;
          }

        default:
          {
            return node;
          }
      }
    }

  });

  if (result == null || result.type !== 'Program') {
    throw new Error('flowImportTo: Unexpected transform result.');
  }

  return result;
}