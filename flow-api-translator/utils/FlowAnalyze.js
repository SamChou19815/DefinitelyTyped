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
exports.analyzeFunctionReturn = analyzeFunctionReturn;
exports.analyzeTypeDependencies = analyzeTypeDependencies;

var _hermesTransform = require("hermes-transform");

var _hermesParser = require("hermes-parser");

function analyzeFunctionReturn(func) {
  const returnType = func.returnType;

  if (returnType != null) {
    return returnType;
  } // We trust Flow has validated this function to only return void
  // $FlowFixMe[incompatible-return]


  return _hermesTransform.t.TypeAnnotation({
    typeAnnotation: _hermesTransform.t.VoidTypeAnnotation()
  });
}

function analyzeTypeDependencies(rootNode, context) {
  const deps = [];

  _hermesParser.SimpleTraverser.traverse(rootNode, {
    enter(node) {
      if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
        const variable = context.referenceMap.get(node);

        if (variable != null) {
          deps.push(variable.name);
        }
      }
    },

    leave() {}

  });

  return deps;
}