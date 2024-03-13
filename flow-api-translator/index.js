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
exports.translateFlowDefToTSDef = translateFlowDefToTSDef;
exports.translateFlowImportsTo = translateFlowImportsTo;
exports.translateFlowToFlowDef = translateFlowToFlowDef;
exports.translateFlowToJS = translateFlowToJS;
exports.translateFlowToTSDef = translateFlowToTSDef;
exports.unstable_translateTSDefToFlowDef = unstable_translateTSDefToFlowDef;

var _hermesTransform = require("hermes-transform");

var _parser = require("@typescript-eslint/parser");

var _visitorKeys = require("@typescript-eslint/visitor-keys");

var _flowToFlowDef = _interopRequireDefault(require("./flowToFlowDef"));

var _flowDefToTSDef = require("./flowDefToTSDef");

var _flowToJS = require("./flowToJS");

var _flowImportTo = require("./flowImportTo");

var _TSDefToFlowDef = require("./TSDefToFlowDef");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

async function translateFlowToFlowDef(code, prettierOptions = {}) {
  const {
    ast,
    scopeManager
  } = await (0, _hermesTransform.parse)(code);
  const [flowDefAst, mutatedCode] = (0, _flowToFlowDef.default)(ast, code, scopeManager, {
    recoverFromErrors: true
  });
  return (0, _hermesTransform.print)(flowDefAst, mutatedCode, prettierOptions);
}

async function translateFlowToTSDef(code, prettierOptions = {}) {
  const flowDefCode = await translateFlowToFlowDef(code, prettierOptions);
  return translateFlowDefToTSDef(flowDefCode, prettierOptions);
}

async function translateFlowDefToTSDef(code, prettierOptions = {}) {
  const {
    ast,
    scopeManager
  } = await (0, _hermesTransform.parse)(code);
  const [tsAST, mutatedCode] = (0, _flowDefToTSDef.flowDefToTSDef)(code, ast, scopeManager, {
    recoverFromErrors: true
  });
  return (0, _hermesTransform.print)( // $FlowExpectedError[incompatible-call] - this is fine as we're providing the visitor keys
  tsAST, mutatedCode, { ...prettierOptions
  }, _visitorKeys.visitorKeys);
}

async function translateFlowToJS(code, prettierOptions = {}) {
  const {
    ast,
    scopeManager
  } = await (0, _hermesTransform.parse)(code);
  const jsAST = (0, _flowToJS.flowToJS)(ast, code, scopeManager);
  return (0, _hermesTransform.print)(jsAST, code, prettierOptions);
}
/**
 * This translator is very experimental and unstable.
 *
 * It is not written with productionizing it in mind, but instead used to evaluate how close Flow
 * is to TypeScript.
 *
 * If you are going to use it anyways, you agree that you are calling a potentially broken function
 * without any guarantee.
 *
 * @deprecated
 */


async function unstable_translateTSDefToFlowDef(code, prettierOptions = {}) {
  const ast = (0, _parser.parse)(code, {
    loc: true,
    range: true,
    sourceType: 'module'
  });

  if (ast == null) {
    throw `Failed to parse ${code} with @typescript-eslint/parser`;
  }

  const [flowAST, mutatedCode] = (0, _TSDefToFlowDef.TSDefToFlowDef)(code, ast, {
    recoverFromErrors: false
  });
  return (0, _hermesTransform.print)(flowAST, mutatedCode, prettierOptions);
}

async function translateFlowImportsTo(code, prettierOptions = {}, opts) {
  const {
    ast,
    scopeManager
  } = await (0, _hermesTransform.parse)(code);
  const jsAST = (0, _flowImportTo.flowImportTo)(ast, code, scopeManager, opts);
  return (0, _hermesTransform.print)(jsAST, code, prettierOptions);
}
