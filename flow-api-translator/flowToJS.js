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
exports.flowToJS = flowToJS;

var _hermesParser = require("hermes-parser");

var _DocblockUtils = require("./utils/DocblockUtils");

const {
  nodeWith
} = _hermesParser.astNodeMutationHelpers;

function stripAtFlow(ast, _options) {
  const docblock = ast.docblock;

  if (docblock == null) {
    return ast;
  }

  return nodeWith(ast, {
    docblock: (0, _DocblockUtils.removeAtFlowFromDocblock)(docblock)
  });
}

function flowToJS(sourceAST, _code, _scopeManager) {
  return [_hermesParser.Transforms.stripComponentSyntax, _hermesParser.Transforms.stripFlowTypes, stripAtFlow].reduce((ast, transform) => transform(ast, {}), sourceAST);
}